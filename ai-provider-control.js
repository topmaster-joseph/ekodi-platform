// FREE-PROVIDER-EXPANSION-20261002: guarded free-first pool + authorized Gemini project pool.
import { handleAdminSessionFastPath } from './admin-session-fastpath.js';
import { getSponsoredAiAllowance, recordProviderUsage } from './api-usage-meter.js';
import { AI_COST_POLICY, evaluateAiCostEligibility } from './ai-cost-policy.js';
import { listOpenAiCostAlerts, loadFreeQuotaStates, quotaCapabilities, recordAiCostAlertDecision, recordFreeProviderOutcome, resolveCostAlertsForPaidConfiguration } from './ai-free-quota.js';
import { createCloudflareWorkersAiProvider } from './cloudflare-workers-ai-provider-adapter.js';
import { createOpenRouterFreeProvider } from './openrouter-free-provider-adapter.js';
import { createGroqFreeProvider } from './groq-free-provider-adapter.js';
import { createCerebrasFreeProvider, createQwenFreeProvider, createDeepSeekFreeCreditProvider } from './extended-free-provider-adapters.js';
import { createHuggingFaceProvider } from './huggingface-provider-adapter.js';

const PREFIX='/api/ai-modules/v1/providers';
const ADMIN_BASE=`${PREFIX}/admin`;
const GATEWAY=`${PREFIX}/generate`;
const PROVIDER_ORDER=Object.freeze(['cloudflare-workers-ai','gemini','openrouter-free','groq-free','cerebras-free','qwen-free','deepseek-free-credit','huggingface-free-credit','openai','anthropic']);
const PROVIDERS=new Set(PROVIDER_ORDER);
const CAPABILITIES=new Set(['default','documents','admin','marketing','translation']);
const DEFAULTS=Object.freeze({
  'cloudflare-workers-ai':{name:'Cloudflare / 무료 자원',model:'@cf/meta/llama-3.1-8b-instruct-fast',binding:'',costClass:'account-managed',secretless:true},
  gemini:{name:'Gemini Free',model:'gemini-3.7-flash',binding:'GEMINI_API_KEY',costClass:'free-preferred'},
  'openrouter-free':{name:'OpenRouter Free',model:'openrouter/free',binding:'OPENROUTER_API_KEY',costClass:'free-preferred'},
  'groq-free':{name:'Groq Free',model:'openai/gpt-oss-20b',binding:'GROQ_API_KEY',costClass:'free-preferred'},
  'cerebras-free':{name:'Cerebras · 무료 체험',model:'qwen-3.8-27b',binding:'CEREBRAS_API_KEY',costClass:'free-preferred',freeGuardBinding:'EKODI_CEREBRAS_FREE_TRIAL_ONLY',freeGuardLabel:'무료 체험 전용 확인'},
  'qwen-free':{name:'Qwen · 무료 할당량',model:'qwen3.7-plus',binding:'QWEN_API_KEY',costClass:'free-preferred',freeGuardBinding:'EKODI_QWEN_FREE_QUOTA_ONLY_CONFIRMED',freeGuardLabel:'Free Quota Only 확인'},
  'deepseek-free-credit':{name:'DeepSeek · 무료 지급 크레딧',model:'deepseek-flash',binding:'DEEPSEEK_API_KEY',costClass:'free-preferred'},
  'huggingface-free-credit':{name:'Hugging Face · 월 무료 크레딧',model:'openai/gpt-oss-120b:cheapest',binding:'HF_TOKEN',costClass:'free-preferred'},
  openai:{name:'OpenAI · 유료 승인',model:'gpt-5.6-terra',binding:'OPENAI_API_KEY',costClass:'paid-opt-in'},
  anthropic:{name:'Claude · 유료 승인',model:'claude-sonnet-5',binding:'ANTHROPIC_API_KEY',costClass:'paid-opt-in'},
});
const RUNTIME_BINDINGS=Object.freeze({
  'cloudflare-workers-ai':{enabled:'EKODI_PROVIDER_WORKERS_AI_ENABLED',priority:'EKODI_PROVIDER_WORKERS_AI_PRIORITY',model:'EKODI_WORKERS_AI_MODEL'},
  gemini:{enabled:'EKODI_PROVIDER_GEMINI_ENABLED',priority:'EKODI_PROVIDER_GEMINI_PRIORITY',model:'EKODI_PROVIDER_GEMINI_MODEL'},
  'openrouter-free':{enabled:'EKODI_PROVIDER_OPENROUTER_FREE_ENABLED',priority:'EKODI_PROVIDER_OPENROUTER_FREE_PRIORITY',model:'EKODI_OPENROUTER_FREE_MODEL'},
  'groq-free':{enabled:'EKODI_PROVIDER_GROQ_FREE_ENABLED',priority:'EKODI_PROVIDER_GROQ_FREE_PRIORITY',model:'EKODI_GROQ_FREE_MODEL'},
  'cerebras-free':{enabled:'EKODI_PROVIDER_CEREBRAS_FREE_ENABLED',priority:'EKODI_PROVIDER_CEREBRAS_FREE_PRIORITY',model:'EKODI_CEREBRAS_FREE_MODEL'},
  'qwen-free':{enabled:'EKODI_PROVIDER_QWEN_FREE_ENABLED',priority:'EKODI_PROVIDER_QWEN_FREE_PRIORITY',model:'EKODI_QWEN_FREE_MODEL'},
  'deepseek-free-credit':{enabled:'EKODI_PROVIDER_DEEPSEEK_FREE_ENABLED',priority:'EKODI_PROVIDER_DEEPSEEK_FREE_PRIORITY',model:'EKODI_DEEPSEEK_FREE_MODEL'},
  'huggingface-free-credit':{enabled:'EKODI_PROVIDER_HF_FREE_ENABLED',priority:'EKODI_PROVIDER_HF_FREE_PRIORITY',model:'EKODI_HF_FREE_MODEL'},
  openai:{enabled:'EKODI_PROVIDER_OPENAI_ENABLED',priority:'EKODI_PROVIDER_OPENAI_PRIORITY',model:'EKODI_PROVIDER_OPENAI_MODEL'},
  anthropic:{enabled:'EKODI_PROVIDER_ANTHROPIC_ENABLED',priority:'EKODI_PROVIDER_ANTHROPIC_PRIORITY',model:'EKODI_PROVIDER_ANTHROPIC_MODEL'},
});
function clean(value,max=120000){return String(value??'').trim().slice(0,max)}
function split(value){return clean(value,12000).split(',').map(v=>v.trim()).filter(Boolean)}
function allowedOrigin(request,env={}){const origin=clean(request.headers.get('origin'),240);if(!origin)return'';return new Set(split(env.ALLOWED_ORIGINS)).has(origin)?origin:''}
function corsHeaders(request,env={}){const headers=new Headers({'access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type,x-ekodi-confirm-impact','access-control-max-age':'86400','vary':'Origin','x-ekodi-ai-provider-contract':'ekodi.ai-provider.v1'});const origin=allowedOrigin(request,env);if(origin)headers.set('access-control-allow-origin',origin);return headers}
function json(request,env,data,status=200){return new Response(JSON.stringify(data),{status,headers:{...Object.fromEntries(corsHeaders(request,env)),'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function managerAdmins(env={}){return new Set([clean(env.ADMIN_EMAIL,1200),...split(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS)].map(v=>v.toLowerCase()).filter(Boolean))}
async function adminSession(request,env){const url=new URL(request.url);url.pathname='/api/session';url.search='';const response=await handleAdminSessionFastPath(new Request(url.toString(),{method:'GET',headers:request.headers}),env);if(!response?.ok)return null;const session=await response.clone().json().catch(()=>null);if(!session?.authenticated||!managerAdmins(env).has(clean(session.email,240).toLowerCase()))return null;return session}
async function audit(env,session,action,target,detail=''){if(!env.DB)return;await env.DB.prepare('INSERT INTO ai_provider_audit (id,admin_email,action,target,detail,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),clean(session?.email,240),action,target,clean(detail,1200),new Date().toISOString()).run().catch(()=>{})}
function configured(env,binding){return Boolean(binding&&clean(env?.[binding],8192))}
function providerConfigured(env,id,binding=''){if(DEFAULTS[id]?.secretless)return Boolean(env?.AI&&typeof env.AI.run==='function');return configured(env,binding||DEFAULTS[id]?.binding)}
function providerFreeGuardConfigured(env,id){const binding=DEFAULTS[id]?.freeGuardBinding;if(!binding)return true;return ['1','true','yes','on','enabled'].includes(clean(env?.[binding],30).toLowerCase())}
function runtimeScriptNames(env={}){const configured=split(env.AI_PROVIDER_RUNTIME_SCRIPTS);if(configured.length)return[...new Set(configured)];return clean(env.ENVIRONMENT,40).toLowerCase()==='production'?['ekodi-auth-api','ekodi-ai-control']:['ekodi-auth-api-staging','ekodi-ai-control-staging']}
function runtimeManagerToken(env={}){return clean(env.CLOUDFLARE_SECRET_MANAGER_TOKEN||env.CF_API_TOKEN,8192)}
function runtimeSyncReady(env={}){return Boolean(runtimeManagerToken(env)&&clean(env.CLOUDFLARE_ACCOUNT_ID,240))}
function secretUrl(env,scriptName){return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(clean(env.CLOUDFLARE_ACCOUNT_ID,240))}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`}
const RUNTIME_SECRET_ATTEMPTS=3;
function runtimeSecretDelay(attempt){return new Promise(resolve=>setTimeout(resolve,400*attempt))}
function runtimeSecretRetryable(status,cfCode){return status===429||status>=500||cfCode===10013}
function runtimeSecretFailure(scriptName,status,cfCode,updated,cfMessage=''){const error=new Error(`runtime_secret_${scriptName}_${status}`);error.scriptName=scriptName;error.status=status;error.cfCode=cfCode;error.cfMessage=clean(cfMessage,240);error.updatedTargets=[...updated];return error}
async function putRuntimeSecret(env,name,value){
  if(!runtimeSyncReady(env))throw new Error('provider_runtime_sync_unavailable');
  const updated=[];
  for(const scriptName of runtimeScriptNames(env)){
    let failure=null;
    for(let attempt=1;attempt<=RUNTIME_SECRET_ATTEMPTS;attempt++){
      let status=0,cfCode=0,cfMessage='';
      try{
        const response=await fetch(secretUrl(env,scriptName),{method:'PUT',headers:{authorization:`Bearer ${runtimeManagerToken(env)}`,'content-type':'application/json'},body:JSON.stringify({name,text:String(value),type:'secret_text'})});
        const data=await response.json().catch(()=>({}));
        if(response.ok&&data?.success!==false){failure=null;break}
        status=response.status;cfCode=Number(data?.errors?.[0]?.code)||0;cfMessage=clean(data?.errors?.[0]?.message,240);
      }catch{status=0}
      failure=runtimeSecretFailure(scriptName,status,cfCode,updated,cfMessage);
      if(status&&!runtimeSecretRetryable(status,cfCode))break;
      if(attempt<RUNTIME_SECRET_ATTEMPTS)await runtimeSecretDelay(attempt);
    }
    if(failure)throw failure;
    updated.push(scriptName);
  }
  return updated;
}
function runtimeSyncFailure(error){const status=Number(error?.status)||0,cfCode=Number(error?.cfCode)||0;const reason=error?.message==='provider_runtime_sync_unavailable'?'secret_manager_not_configured':cfCode===10215?'worker_latest_version_not_deployed':status===401||status===403?'secret_manager_permission_denied':status===404?'runtime_worker_not_found':status===429?'cloudflare_rate_limited':status===0?'cloudflare_unreachable':'cloudflare_secret_write_failed';return{reason,target:clean(error?.scriptName,120),status,cfCode,providerMessage:clean(error?.cfMessage,240),updatedTargets:Array.isArray(error?.updatedTargets)?error.updatedTargets.map(v=>clean(v,120)):[]}}
async function runtimeSecretInventory(env={}){if(!runtimeSyncReady(env))return null;const inventory=new Map();for(const scriptName of runtimeScriptNames(env)){try{const response=await fetch(secretUrl(env,scriptName),{method:'GET',headers:{authorization:`Bearer ${runtimeManagerToken(env)}`,'content-type':'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok||data?.success===false){inventory.set(scriptName,null);continue}inventory.set(scriptName,new Set((Array.isArray(data?.result)?data.result:[]).map(item=>clean(item?.name,128)).filter(Boolean)))}catch{inventory.set(scriptName,null)}}return inventory}
async function fingerprint(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].slice(0,8).map(v=>v.toString(16).padStart(2,'0')).join('')}
function runtimeEnabled(env,id,fallback){const value=clean(env?.[RUNTIME_BINDINGS[id]?.enabled],30).toLowerCase();if(!value)return fallback;return ['1','true','yes','on','enabled'].includes(value)}
function providerCostEligibility(id,context={}){return evaluateAiCostEligibility({costClass:DEFAULTS[id]?.costClass||'unknown'},context)}
function providerHealthBlocksTraffic(row){const status=clean(row?.health_status,40).toLowerCase(),code=clean(row?.last_error,160).toLowerCase();if(status==='unconfigured')return true;if(status!=='error')return false;return /(credit_balance_exhausted|insufficient_quota|spend_limit|quota_exceeded|billing_hard_limit|billing_not_active|invalid_api_key|authentication_error|not_configured)/.test(code)}
function freeQuotaProviderId(id){if(id==='gemini')return'gemini-free';if(['cloudflare-workers-ai','openrouter-free','groq-free','cerebras-free','qwen-free','deepseek-free-credit','huggingface-free-credit'].includes(id))return id;return''}
async function freeQuotaBlocked(env,id){const quotaId=freeQuotaProviderId(id);if(!quotaId)return false;const map=await quotaCapabilities(env,[quotaId]);return map[quotaId]?.remaining===0}
async function recordGatewayFreeQuota(env,id,outcome){const quotaId=freeQuotaProviderId(id);if(!quotaId)return;await recordFreeProviderOutcome(env,quotaId,outcome).catch(()=>{})}

async function providerSnapshot(env){
  const rows=env.DB?(await env.DB.prepare('SELECT * FROM ai_provider_registry ORDER BY priority, provider_id').all()).results:[];
  const routes=env.DB?(await env.DB.prepare('SELECT * FROM ai_provider_routes ORDER BY capability').all()).results:[];
  const targets=runtimeScriptNames(env),inventory=await runtimeSecretInventory(env);
  const providers=rows.map(row=>{
    const runtime={enabled:runtimeEnabled(env,row.provider_id,Boolean(row.enabled)),priority:Number(env?.[RUNTIME_BINDINGS[row.provider_id]?.priority]||row.priority||100),model:clean(env?.[RUNTIME_BINDINGS[row.provider_id]?.model],120)||row.default_model};
    const secretless=Boolean(DEFAULTS[row.provider_id]?.secretless);
    const runtimeTargets=secretless?[]:targets.map(scriptName=>({scriptName,configured:inventory?.get(scriptName) instanceof Set?inventory.get(scriptName).has(row.secret_binding):null}));
    const runtimeInventoryKnown=secretless||runtimeTargets.every(target=>target.configured!==null);
    const runtimeConfigured=secretless?providerConfigured(env,row.provider_id,row.secret_binding):(runtimeInventoryKnown?runtimeTargets.every(target=>target.configured===true):providerConfigured(env,row.provider_id,row.secret_binding));
    const freeGuardConfigured=providerFreeGuardConfigured(env,row.provider_id);
    const inSync=runtime.enabled===Boolean(row.enabled)&&runtime.priority===Number(row.priority||100)&&runtime.model===row.default_model;
    const verificationPassed=clean(row.health_status,40).toLowerCase()==='healthy';
    const trafficEligible=Boolean(row.enabled)&&runtime.enabled&&runtimeConfigured&&freeGuardConfigured&&inSync&&!providerHealthBlocksTraffic(row);
    const activationState=!Boolean(row.enabled)?'disabled':!runtimeConfigured?'secret-required':!freeGuardConfigured?'guard-required':!inSync||!runtime.enabled?'runtime-sync-required':verificationPassed?'verified':'verification-required';
    return{id:row.provider_id,name:row.display_name,type:row.provider_type,enabled:Boolean(row.enabled),priority:Number(row.priority||100),model:row.default_model,secretBinding:row.secret_binding,costClass:row.cost_class,configured:runtimeConfigured,requiresSecret:!secretless,freeGuardRequired:Boolean(DEFAULTS[row.provider_id]?.freeGuardBinding),freeGuardLabel:DEFAULTS[row.provider_id]?.freeGuardLabel||'',freeGuardConfigured,health:row.health_status||'unknown',lastCheckedAt:row.last_checked_at||'',lastError:row.last_error||'',runtime,runtimeTargets,inSync,verificationPassed,trafficEligible,fallbackEligible:trafficEligible,activationState,valueReturned:false};
  });
  const [alerts,freeQuotaStates]=await Promise.all([listOpenAiCostAlerts(env),loadFreeQuotaStates(env)]);
  return{contract:'ekodi.ai-provider.v1',control:{runtimeSyncReady:runtimeSyncReady(env),runtimeTargets:targets,highImpactRequiresHuman:true,costPolicyId:AI_COST_POLICY.policyId,paidApiAutoEscalation:AI_COST_POLICY.paidApiAutoEscalation,automaticPaidBudgetKrw:AI_COST_POLICY.automaticPaidBudgetKrw,paidDecisionMode:'human-only'},providers,routes:routes.map(row=>({capability:row.capability,primaryProvider:row.primary_provider,fallbacks:JSON.parse(row.fallback_json||'[]'),modelOverride:row.model_override||''})),alerts,freeQuotaStates,generatedAt:new Date().toISOString()};
}
function outputText(data){if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();return(data?.output||[]).flatMap(item=>item?.content||[]).map(item=>clean(item?.text,40000)).filter(Boolean).join('\n').trim()}
function providerHttpError(prefix,status,data){const rawStatus=clean(data?.error?.status||data?.error?.type||data?.error?.code,80),reason=clean((Array.isArray(data?.error?.details)?data.error.details:[]).find(item=>item?.reason)?.reason,80),message=clean(data?.error?.message,320),normalized=message.toLowerCase();let detail=(reason||rawStatus).toLowerCase().replace(/[^a-z0-9._-]+/g,'_');if(prefix==='gemini'&&status===400){if(reason==='API_KEY_INVALID'||/api key not valid|invalid api key/.test(normalized))detail='api_key_invalid';else if(rawStatus==='FAILED_PRECONDITION'||/free tier is not available|enable billing|billing/.test(normalized))detail='failed_precondition';else if(rawStatus==='INVALID_ARGUMENT')detail='invalid_argument'}const error=new Error(prefix+'_'+status+(detail?'_'+detail:''));error.providerMessage=message;error.requestId=clean(data?.request_id,120);return error}
async function invokeOpenAI(env,model,system,input,maxOutputTokens){const key=clean(env.OPENAI_API_KEY,8192);if(!key)throw new Error('openai_not_configured');const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:model||DEFAULTS.openai.model,store:false,instructions:system,input,max_output_tokens:maxOutputTokens}),signal:AbortSignal.timeout(60000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw providerHttpError('openai',response.status,data);const text=outputText(data);if(!text)throw new Error('openai_empty_response');return{text,provider:'openai',model:clean(data?.model||model||DEFAULTS.openai.model,120),inputUnits:Number(data?.usage?.input_tokens||0),outputUnits:Number(data?.usage?.output_tokens||0),cachedUnits:Number(data?.usage?.input_tokens_details?.cached_tokens||0)}}
async function invokeGemini(env,model,system,input,maxOutputTokens){const key=clean(env.GEMINI_API_KEY||env.GOOGLE_AI_API_KEY,8192);if(!key)throw new Error('gemini_not_configured');const selected=model||DEFAULTS.gemini.model;const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:input}]}],generationConfig:{temperature:0.2,maxOutputTokens}}),signal:AbortSignal.timeout(60000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw providerHttpError('gemini',response.status,data);const text=(data?.candidates?.[0]?.content?.parts||[]).map(part=>clean(part?.text,40000)).filter(Boolean).join('\n').trim();if(!text)throw new Error('gemini_empty_response');return{text,provider:'gemini',model:selected,inputUnits:Number(data?.usageMetadata?.promptTokenCount||0),outputUnits:Number(data?.usageMetadata?.candidatesTokenCount||0),cachedUnits:0}}
async function invokeAnthropic(env,model,system,input,maxOutputTokens){const key=clean(env.ANTHROPIC_API_KEY,8192);if(!key)throw new Error('anthropic_not_configured');const selected=model||DEFAULTS.anthropic.model;const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:selected,max_tokens:maxOutputTokens,system,messages:[{role:'user',content:input}]}),signal:AbortSignal.timeout(60000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw providerHttpError('anthropic',response.status,data);const text=(data?.content||[]).filter(item=>item?.type==='text').map(item=>clean(item?.text,40000)).filter(Boolean).join('\n').trim();if(!text)throw new Error('anthropic_empty_response');return{text,provider:'anthropic',model:clean(data?.model||selected,120),inputUnits:Number(data?.usage?.input_tokens||0),outputUnits:Number(data?.usage?.output_tokens||0),cachedUnits:0}}
async function invokeProvider(env,id,model,system,input,maxOutputTokens=4096){
  if(id==='openai')return invokeOpenAI(env,model,system,input,maxOutputTokens);
  if(id==='gemini')return invokeGemini(env,model,system,input,maxOutputTokens);
  if(id==='anthropic')return invokeAnthropic(env,model,system,input,maxOutputTokens);
  if(id==='cloudflare-workers-ai'){
    const provider=createCloudflareWorkersAiProvider(env,{ai:env.AI});
    const result=await provider.invoke({taskName:'provider-gateway',context:{system,input,maxOutputTokens}});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:Number(result?.usage?.inputTokens||0),outputUnits:Number(result?.usage?.outputTokens||0),cachedUnits:0,quota:null};
  }
  if(id==='openrouter-free'){
    const result=await createOpenRouterFreeProvider({...env,EKODI_OPENROUTER_FREE_MODEL:model||DEFAULTS[id].model},{fetchImpl:globalThis.fetch}).invoke({prompt:[system,input].filter(Boolean).join('\n\n')});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:0,outputUnits:0,cachedUnits:0,quota:result.quota||null};
  }
  if(id==='groq-free'){
    const result=await createGroqFreeProvider({...env,EKODI_GROQ_FREE_MODEL:model||DEFAULTS[id].model},{fetchImpl:globalThis.fetch}).invoke({prompt:[system,input].filter(Boolean).join('\n\n')});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:0,outputUnits:0,cachedUnits:0,quota:result.quota||null};
  }
  if(id==='cerebras-free'){
    const result=await createCerebrasFreeProvider({...env,EKODI_CEREBRAS_FREE_MODEL:model||DEFAULTS[id].model},{fetchImpl:globalThis.fetch}).invoke({prompt:[system,input].filter(Boolean).join('\n\n')});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:0,outputUnits:0,cachedUnits:0,quota:result.quota||null};
  }
  if(id==='qwen-free'){
    const result=await createQwenFreeProvider({...env,EKODI_QWEN_FREE_MODEL:model||DEFAULTS[id].model},{fetchImpl:globalThis.fetch}).invoke({prompt:[system,input].filter(Boolean).join('\n\n')});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:0,outputUnits:0,cachedUnits:0,quota:result.quota||null};
  }
  if(id==='deepseek-free-credit'){
    const result=await createDeepSeekFreeCreditProvider({...env,EKODI_DEEPSEEK_FREE_MODEL:model||DEFAULTS[id].model},{fetchImpl:globalThis.fetch}).invoke({prompt:[system,input].filter(Boolean).join('\n\n')});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:0,outputUnits:0,cachedUnits:0,quota:result.quota||null};
  }
  if(id==='huggingface-free-credit'){
    const result=await createHuggingFaceProvider({...env,EKODI_HF_FREE_MODEL:model||DEFAULTS[id].model},{fetchImpl:globalThis.fetch}).invoke({prompt:[system,input].filter(Boolean).join('\n\n')});
    return{text:result.text,provider:id,model:result.model||model||DEFAULTS[id].model,inputUnits:0,outputUnits:0,cachedUnits:0,quota:result.quota||null};
  }
  throw new Error('unsupported_provider');
}
async function providerRow(env,id){return env.DB?env.DB.prepare('SELECT * FROM ai_provider_registry WHERE provider_id=?').bind(id).first():null}
async function route(env,capability){const cap=CAPABILITIES.has(capability)?capability:'default';const row=env.DB?await env.DB.prepare('SELECT * FROM ai_provider_routes WHERE capability=?').bind(cap).first():null;const fallback=row?JSON.parse(row.fallback_json||'[]'):PROVIDER_ORDER.slice(1);return{capability:cap,primaryProvider:row?.primary_provider||PROVIDER_ORDER[0],fallbacks:Array.isArray(fallback)?fallback:[],modelOverride:row?.model_override||''}}
async function recordCall(env,{capability,provider,model,status,responseMs,inputUnits=0,outputUnits=0,errorCode=''}){if(!env.DB)return;await env.DB.prepare('INSERT INTO ai_provider_calls (id,capability,provider_id,model,status,response_ms,input_units,output_units,error_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),capability,provider,model||'',status,responseMs,inputUnits,outputUnits,clean(errorCode,160),new Date().toISOString()).run().catch(()=>{})}
async function recordMeter(env,result,capability){if(!env.DB)return;await recordProviderUsage(env,{provider:result.provider,model:result.model,surface:`provider-gateway:${capability}`,funding:'ekodi-sponsored',requestId:crypto.randomUUID(),usage:{inputTokens:result.inputUnits,cachedInputTokens:result.cachedUnits||0,outputTokens:result.outputUnits,totalTokens:result.inputUnits+result.outputUnits}}).catch(()=>{})}
async function verifySupabaseUser(request,env){const auth=clean(request.headers.get('authorization'),8192);if(!auth)return null;const base=clean(env.MY_SUPABASE_URL,400).replace(/\/$/,'');const key=clean(env.MY_SUPABASE_PUBLISHABLE_KEY,1000);if(!base||!key)return null;const response=await fetch(`${base}/auth/v1/user`,{headers:{authorization:auth,apikey:key},signal:AbortSignal.timeout(10000)});if(!response.ok)return null;const user=await response.json().catch(()=>null);return user?.id?user:null}
async function budgetAllowed(env){if(!env.DB?.prepare)return clean(env.ENVIRONMENT,40).toLowerCase()!=='production';const allowance=await getSponsoredAiAllowance(env);return allowance.allowed!==false}
export async function invokeAiProviderCapability(env,{capability='default',system='',input='',maxOutputTokens=4096,governance={}}={}){
  const cap=CAPABILITIES.has(clean(capability,40))?clean(capability,40):'default';
  const safeInput=clean(input,120000),safeSystem=clean(system,12000);
  if(!safeInput)throw new Error('input_required');
  if(!await budgetAllowed(env))throw new Error('budget_limit_reached');
  const selected=await route(env,cap);
  const order=[selected.primaryProvider,...selected.fallbacks].filter((id,index,array)=>PROVIDERS.has(id)&&array.indexOf(id)===index);
  const attempted=[],blocked=[];
  for(const id of order){
    const row=await providerRow(env,id);
    if(row&&Number(row.enabled)!==1)continue;
    const cost=providerCostEligibility(id,governance);
    if(!cost.eligible){blocked.push(id);continue;}
    if(await freeQuotaBlocked(env,id)){blocked.push(id);continue;}
    if(providerHealthBlocksTraffic(row)){blocked.push(id);continue;}
    const binding=row?.secret_binding||DEFAULTS[id]?.binding;
    if(!providerConfigured(env,id,binding))continue;
    const model=selected.modelOverride||row?.default_model||DEFAULTS[id]?.model||'';
    const started=Date.now();attempted.push(id);
    try{
      const result=await invokeProvider(env,id,model,safeSystem,safeInput,Math.max(64,Math.min(8192,Number(maxOutputTokens)||4096)));
      await recordGatewayFreeQuota(env,id,{ok:true,quota:result.quota||null});
      await recordCall(env,{capability:cap,provider:id,model:result.model,status:'completed',responseMs:Date.now()-started,inputUnits:result.inputUnits,outputUnits:result.outputUnits});
      await recordMeter(env,result,cap);
      return Object.freeze({ok:true,capability:cap,text:result.text,provider:result.provider,model:result.model,usage:Object.freeze({inputUnits:result.inputUnits,outputUnits:result.outputUnits})});
    }catch(error){
      await recordGatewayFreeQuota(env,id,{ok:false,error});
      await recordCall(env,{capability:cap,provider:id,model,status:'failed',responseMs:Date.now()-started,errorCode:clean(error?.message||error,160)});
    }
  }
  const error=new Error('provider_unavailable');error.attempted=attempted;error.blocked=blocked;throw error;
}
async function runGateway(request,env){if(request.method==='OPTIONS'){const headers=corsHeaders(request,env);if(!headers.get('access-control-allow-origin'))return json(request,env,{error:'origin_forbidden'},403);return new Response(null,{status:204,headers})}if(request.method!=='POST')return json(request,env,{error:'method_not_allowed'},405);const user=await verifySupabaseUser(request,env);if(!user)return json(request,env,{error:'authentication_required'},401);if(!await budgetAllowed(env))return json(request,env,{error:'budget_limit_reached'},429);const body=await request.json().catch(()=>({}));const capability=CAPABILITIES.has(clean(body?.capability,40))?clean(body.capability,40):'default';const system=clean(body?.system,12000),input=clean(body?.input,120000),maxOutputTokens=Math.max(64,Math.min(8192,Number(body?.maxOutputTokens)||4096));if(!input)return json(request,env,{error:'input_required'},400);const selected=await route(env,capability);const order=[selected.primaryProvider,...selected.fallbacks].filter((id,index,array)=>PROVIDERS.has(id)&&array.indexOf(id)===index);const attempted=[],blocked=[];for(const id of order){const row=await providerRow(env,id);if(row&&Number(row.enabled)!==1)continue;const cost=providerCostEligibility(id,{});if(!cost.eligible){blocked.push(id);continue;}if(await freeQuotaBlocked(env,id)){blocked.push(id);continue;}if(providerHealthBlocksTraffic(row)){blocked.push(id);continue;}const binding=row?.secret_binding||DEFAULTS[id]?.binding;if(!providerConfigured(env,id,binding))continue;const model=selected.modelOverride||row?.default_model||DEFAULTS[id]?.model||'';const started=Date.now();attempted.push(id);try{const result=await invokeProvider(env,id,model,system,input,maxOutputTokens);await recordGatewayFreeQuota(env,id,{ok:true,quota:result.quota||null});await recordCall(env,{capability,provider:id,model:result.model,status:'completed',responseMs:Date.now()-started,inputUnits:result.inputUnits,outputUnits:result.outputUnits});await recordMeter(env,result,capability);return json(request,env,{ok:true,contract:'ekodi.ai-provider.v1',text:result.text,provider:{id:result.provider,model:result.model},usage:{inputUnits:result.inputUnits,outputUnits:result.outputUnits}},200)}catch(error){await recordGatewayFreeQuota(env,id,{ok:false,error});await recordCall(env,{capability,provider:id,model,status:'failed',responseMs:Date.now()-started,errorCode:clean(error?.message||error,160)})}}return json(request,env,{error:'provider_unavailable',attempted,blocked},503)}
async function syncProviderRuntime(env,id,{enabled,priority,model,freeGuardConfirmed=false}){const bindings=RUNTIME_BINDINGS[id];if(!bindings)throw new Error('unknown_provider');const freeGuardBinding=DEFAULTS[id]?.freeGuardBinding||'',existingFreeGuard=providerFreeGuardConfigured(env,id);if(enabled&&freeGuardBinding&&!freeGuardConfirmed&&!existingFreeGuard)throw new Error('free_provider_guard_confirmation_required');const pairs=[['AI_MULTI_PROVIDER_ENABLED','true'],[bindings.enabled,enabled?'true':'false'],[bindings.priority,String(priority)],[bindings.model,model]];if(freeGuardBinding)pairs.push([freeGuardBinding,enabled&&(freeGuardConfirmed||existingFreeGuard)?'true':'false']);for(const[name,value]of pairs)await putRuntimeSecret(env,name,value)}
async function updateProvider(request,env,session,id){
  if(request.headers.get('x-ekodi-confirm-impact')!=='ai-provider-runtime-update')return json(request,env,{error:'confirmation_required',code:'AI_PROVIDER_CONFIRMATION_REQUIRED'},428);
  if(!PROVIDERS.has(id))return json(request,env,{error:'unknown_provider'},404);
  const body=await request.json().catch(()=>({})),enabled=body.enabled===true?1:body.enabled===false?0:null;
  if(enabled===null)return json(request,env,{error:'enabled_required'},400);
  const priority=Math.max(1,Math.min(999,Number(body.priority)||100)),current=await providerRow(env,id),model=clean(body.defaultModel,120)||current?.default_model||DEFAULTS[id].model;
  const freeGuardConfirmed=body.freeGuardConfirmed===true;
  try{await syncProviderRuntime(env,id,{enabled:Boolean(enabled),priority,model,freeGuardConfirmed})}catch(error){if(error?.message==='free_provider_guard_confirmation_required')return json(request,env,{error:'free_provider_guard_confirmation_required',provider:id},409);const failure=runtimeSyncFailure(error);await audit(env,session,'provider.update.failed',id,JSON.stringify(failure));return json(request,env,{error:'provider_runtime_sync_failed',...failure},503)}
  await env.DB.prepare('UPDATE ai_provider_registry SET enabled=?,priority=?,default_model=?,updated_at=?,updated_by=? WHERE provider_id=?').bind(enabled,priority,model,new Date().toISOString(),clean(session.email,240),id).run();
  if(enabled===1&&DEFAULTS[id]?.costClass==='paid-opt-in')await resolveCostAlertsForPaidConfiguration(env,session.email).catch(()=>{});
  await audit(env,session,'provider.update',id,JSON.stringify({enabled:Boolean(enabled),priority,model,runtimeSynced:true}));
  return json(request,env,await providerSnapshot(env));
}
async function decideCostAlert(request,env,session,alertId){
  if(request.headers.get('x-ekodi-confirm-impact')!=='ai-cost-alert-decision')return json(request,env,{error:'confirmation_required',code:'AI_COST_ALERT_CONFIRMATION_REQUIRED'},428);
  const body=await request.json().catch(()=>({}));
  try{
    const alert=await recordAiCostAlertDecision(env,alertId,body.decision,session.email);
    await audit(env,session,'cost-alert.decision',alertId,JSON.stringify({decision:alert.decision}));
    return json(request,env,await providerSnapshot(env));
  }catch(error){return json(request,env,{error:clean(error?.message||error,160)},error?.message==='cost_alert_not_found'?404:400)}
}
async function updateRoute(request,env,session,capability){if(request.headers.get('x-ekodi-confirm-impact')!=='ai-provider-route-update')return json(request,env,{error:'confirmation_required',code:'AI_PROVIDER_ROUTE_CONFIRMATION_REQUIRED'},428);if(!CAPABILITIES.has(capability))return json(request,env,{error:'unknown_capability'},404);const body=await request.json().catch(()=>({}));const primary=clean(body.primaryProvider,40),fallbacks=Array.isArray(body.fallbacks)?body.fallbacks.map(v=>clean(v,40)).filter(v=>PROVIDERS.has(v)&&v!==primary).slice(0,5):[],model=clean(body.modelOverride,120);if(!PROVIDERS.has(primary))return json(request,env,{error:'invalid_primary_provider'},400);await env.DB.prepare('INSERT INTO ai_provider_routes (capability,primary_provider,fallback_json,model_override,updated_at,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(capability) DO UPDATE SET primary_provider=excluded.primary_provider,fallback_json=excluded.fallback_json,model_override=excluded.model_override,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(capability,primary,JSON.stringify(fallbacks),model,new Date().toISOString(),clean(session.email,240)).run();await audit(env,session,'route.update',capability,JSON.stringify({primary,fallbacks,model}));return json(request,env,await providerSnapshot(env))}
async function connectSecret(request,env,session,id){if(request.headers.get('x-ekodi-confirm-impact')!=='ai-provider-secret-connect')return json(request,env,{error:'confirmation_required',code:'AI_PROVIDER_SECRET_CONFIRMATION_REQUIRED'},428);if(!PROVIDERS.has(id))return json(request,env,{error:'unknown_provider'},404);if(DEFAULTS[id]?.secretless)return json(request,env,{error:'provider_secret_not_required'},409);if(!runtimeSyncReady(env))return json(request,env,{error:'secret_manager_not_configured'},503);const body=await request.json().catch(()=>({})),value=clean(body.value,8192);if(value.length<16)return json(request,env,{error:'invalid_secret_value'},400);const binding=DEFAULTS[id].binding,mark=await fingerprint(value);try{await putRuntimeSecret(env,binding,value)}catch(error){const failure=runtimeSyncFailure(error);await audit(env,session,'provider.secret.connect.failed',id,JSON.stringify({binding,fingerprint:mark,...failure}));return json(request,env,{error:'secret_connect_failed',...failure},502)}await env.DB.prepare("UPDATE ai_provider_registry SET health_status='unknown',last_error='',updated_at=?,updated_by=? WHERE provider_id=?").bind(new Date().toISOString(),clean(session.email,240),id).run();await audit(env,session,'provider.secret.connect',id,JSON.stringify({binding,fingerprint:mark,valueReturned:false}));return json(request,env,{ok:true,provider:id,binding,fingerprint:mark,valueReturned:false})}
async function checkProvider(request,env,session,id){if(!PROVIDERS.has(id))return json(request,env,{error:'unknown_provider'},404);const row=await providerRow(env,id),binding=row?.secret_binding||DEFAULTS[id].binding;if(!providerConfigured(env,id,binding)){await env.DB.prepare("UPDATE ai_provider_registry SET health_status='unconfigured',last_checked_at=?,last_error='secret_not_configured' WHERE provider_id=?").bind(new Date().toISOString(),id).run();return json(request,env,{ok:false,provider:id,status:'unconfigured'},409)}const started=Date.now();try{const result=await invokeProvider(env,id,row?.default_model||DEFAULTS[id].model,'Return exactly EKODI_PROVIDER_OK.','Health check only.',id==='anthropic'?512:id==='gemini'?256:64),ok=result.text.includes('EKODI_PROVIDER_OK');await env.DB.prepare('UPDATE ai_provider_registry SET health_status=?,last_checked_at=?,last_error=? WHERE provider_id=?').bind(ok?'healthy':'degraded',new Date().toISOString(),ok?'':'unexpected_output',id).run();await recordCall(env,{capability:'health',provider:id,model:result.model,status:ok?'completed':'failed',responseMs:Date.now()-started,inputUnits:result.inputUnits,outputUnits:result.outputUnits,errorCode:ok?'':'unexpected_output'});await audit(env,session,'provider.check',id,ok?'healthy':'unexpected_output');return json(request,env,{ok,provider:id,status:ok?'healthy':'degraded',responseMs:Date.now()-started,model:result.model},ok?200:502)}catch(error){const code=clean(error?.message||error,160);await env.DB.prepare("UPDATE ai_provider_registry SET health_status='error',last_checked_at=?,last_error=? WHERE provider_id=?").bind(new Date().toISOString(),code,id).run();await recordCall(env,{capability:'health',provider:id,model:row?.default_model||'',status:'failed',responseMs:Date.now()-started,errorCode:code});return json(request,env,{ok:false,provider:id,status:'error',code,providerMessage:clean(error?.providerMessage,320),requestId:clean(error?.requestId,120)},502)}}
const HEALTH_MIN_INTERVAL_MS=55*60*1000;
function providerHealthDue(row,nowMs){const checked=Date.parse(clean(row?.last_checked_at,80));return !Number.isFinite(checked)||nowMs-checked>=HEALTH_MIN_INTERVAL_MS}
async function runScheduledProviderHealth(env,row,nowMs){const id=clean(row?.provider_id,40);if(!PROVIDERS.has(id)||Number(row?.enabled)!==1||!runtimeEnabled(env,id,true))return{provider:id,status:'disabled',checked:false};const cost=providerCostEligibility(id,{});if(!cost.eligible)return{provider:id,status:'cost-blocked',checked:false,blockedBy:cost.blockedBy};if(!providerHealthDue(row,nowMs))return{provider:id,status:row?.health_status||'unknown',checked:false};const binding=row?.secret_binding||DEFAULTS[id].binding,checkedAt=new Date(nowMs).toISOString();if(!providerConfigured(env,id,binding)){await env.DB.prepare("UPDATE ai_provider_registry SET health_status='unconfigured',last_checked_at=?,last_error='secret_not_configured' WHERE provider_id=?").bind(checkedAt,id).run();await recordCall(env,{capability:'health',provider:id,model:row?.default_model||'',status:'failed',responseMs:0,errorCode:'secret_not_configured'});return{provider:id,status:'unconfigured',checked:true}}const started=Date.now();try{const result=await invokeProvider(env,id,row?.default_model||DEFAULTS[id].model,'Return exactly EKODI_PROVIDER_OK.','Scheduled provider health check only.',id==='anthropic'?512:id==='gemini'?256:64),ok=result.text.includes('EKODI_PROVIDER_OK'),status=ok?'healthy':'degraded',errorCode=ok?'':'unexpected_output';await env.DB.prepare('UPDATE ai_provider_registry SET health_status=?,last_checked_at=?,last_error=? WHERE provider_id=?').bind(status,checkedAt,errorCode,id).run();await recordCall(env,{capability:'health',provider:id,model:result.model,status:ok?'completed':'failed',responseMs:Date.now()-started,inputUnits:result.inputUnits,outputUnits:result.outputUnits,errorCode});await recordMeter(env,result,'health');await audit(env,{email:'system:provider-health'},'provider.health.schedule',id,status);return{provider:id,status,checked:true,model:result.model}}catch(error){const code=clean(error?.message||error,160);await env.DB.prepare("UPDATE ai_provider_registry SET health_status='error',last_checked_at=?,last_error=? WHERE provider_id=?").bind(checkedAt,code,id).run();await recordCall(env,{capability:'health',provider:id,model:row?.default_model||'',status:'failed',responseMs:Date.now()-started,errorCode:code});await audit(env,{email:'system:provider-health'},'provider.health.schedule',id,code);return{provider:id,status:'error',checked:true,errorCode:code}}}
export async function runAiProviderHealthSchedule(env={},options={}){if(!env.DB?.prepare)return{ok:false,checked:0,skipped:0,reason:'database_unavailable'};const nowCandidate=Number(options.scheduledTime??options.now??Date.now()),nowMs=Number.isFinite(nowCandidate)&&nowCandidate>0?nowCandidate:Date.now(),rows=(await env.DB.prepare('SELECT * FROM ai_provider_registry ORDER BY priority, provider_id').all()).results||[],results=[];for(const row of rows)results.push(await runScheduledProviderHealth(env,row,nowMs));const checked=results.filter(item=>item.checked),failed=checked.filter(item=>item.status!=='healthy');return{ok:failed.length===0,checked:checked.length,skipped:results.length-checked.length,results}}

export async function handleAiProviderControl(request,env={}){const path=new URL(request.url).pathname;if(!path.startsWith(PREFIX))return null;if(request.method==='OPTIONS')return runGateway(request,env);if(path===`${PREFIX}/health`&&request.method==='GET')return json(request,env,{ok:true,contract:'ekodi.ai-provider.v1',providerIndependent:true,secretValuesReturned:false,costMode:'free-first',paidApiAutoEscalation:false,paidDecisionMode:'human-only'});if(path===GATEWAY)return runGateway(request,env);if(!path.startsWith(ADMIN_BASE))return null;const session=await adminSession(request,env);if(!session)return json(request,env,{error:'admin_authentication_required'},401);if(!env.DB)return json(request,env,{error:'database_unavailable'},503);if(path===ADMIN_BASE&&request.method==='GET')return json(request,env,await providerSnapshot(env));const provider=path.match(/^\/api\/ai-modules\/v1\/providers\/admin\/([a-z0-9-]+)$/);if(provider&&request.method==='PUT')return updateProvider(request,env,session,provider[1]);const secret=path.match(/^\/api\/ai-modules\/v1\/providers\/admin\/([a-z0-9-]+)\/secret$/);if(secret&&request.method==='POST')return connectSecret(request,env,session,secret[1]);const check=path.match(/^\/api\/ai-modules\/v1\/providers\/admin\/([a-z0-9-]+)\/check$/);if(check&&request.method==='POST')return checkProvider(request,env,session,check[1]);const alertDecision=path.match(/^\/api\/ai-modules\/v1\/providers\/admin\/alerts\/([a-zA-Z0-9._-]+)\/decision$/);if(alertDecision&&request.method==='POST')return decideCostAlert(request,env,session,alertDecision[1]);const routeMatch=path.match(/^\/api\/ai-modules\/v1\/providers\/admin\/routes\/([a-z0-9-]+)$/);if(routeMatch&&request.method==='PUT')return updateRoute(request,env,session,routeMatch[1]);return json(request,env,{error:'not_found'},404)}
export const AI_PROVIDER_CONTROL_CONTRACT=Object.freeze({version:'ekodi.ai-provider.v1',prefix:PREFIX,adminBase:ADMIN_BASE,gateway:GATEWAY,providers:[...PROVIDER_ORDER],providerOrder:PROVIDER_ORDER,capabilities:[...CAPABILITIES],costPolicyId:AI_COST_POLICY.policyId});
export { putRuntimeSecret as putProviderRuntimeSecret, runtimeSyncFailure as describeProviderRuntimeSyncFailure };
