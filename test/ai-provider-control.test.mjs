import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleAiProviderControl, invokeAiProviderCapability, runAiProviderHealthSchedule, AI_PROVIDER_CONTROL_CONTRACT } from '../ai-provider-control.js';
import { createEkodiAiProviderRegistry } from '../ekodi-ai-provider-registry.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('common provider gateway exposes allowed-origin CORS contract',async()=>{
  const response=await handleAiProviderControl(new Request('https://ekodi.kr/api/ai-modules/v1/providers/generate',{method:'OPTIONS',headers:{origin:'https://my.ekodi.kr'}}),{ALLOWED_ORIGINS:'https://my.ekodi.kr,https://admin.ekodi.kr'});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://my.ekodi.kr');
  assert.equal(response.headers.get('x-ekodi-ai-provider-contract'),'ekodi.ai-provider.v1');
});

test('common provider gateway blocks unauthenticated generation before provider access',async()=>{
  const response=await handleAiProviderControl(new Request('https://ekodi.kr/api/ai-modules/v1/providers/generate',{method:'POST',headers:{origin:'https://my.ekodi.kr','content-type':'application/json'},body:JSON.stringify({capability:'documents',input:'test'})}),{ALLOWED_ORIGINS:'https://my.ekodi.kr'});
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,'authentication_required');
});

test('provider registry honors managed enable priority and model overrides without exposing keys',()=>{
  const env={OPENAI_API_KEY:'openai-test-secret',EKODI_PROVIDER_OPENAI_ENABLED:'false',EKODI_PROVIDER_OPENAI_PRIORITY:'77',EKODI_PROVIDER_OPENAI_MODEL:'gpt-5.6-terra'};
  const provider=createEkodiAiProviderRegistry(env).find(item=>item.id==='openai');
  assert.equal(provider.available,false);
  assert.equal(provider.priority,77);
  assert.equal(provider.model,'gpt-5.6-terra');
  assert.equal(JSON.stringify(provider).includes('openai-test-secret'),false);
});

test('provider control requires human gates and never returns raw secrets',()=>{
  const api=read('ai-provider-control.js'),admin=read('admin-provider-control.js'),migration=read('migrations/0068_ai_provider_registry.sql');
  assert.match(api,/ai-provider-runtime-update/);
  assert.match(api,/ai-provider-route-update/);
  assert.match(api,/ai-provider-secret-connect/);
  assert.match(api,/valueReturned:false/);
  assert.match(api,/store:false/);
  assert.doesNotMatch(admin,/localStorage/);
  assert.match(admin,/type=\"password\"/);
  assert.match(migration,/ai_provider_calls/);
  assert.match(migration,/ai_provider_audit/);
  assert.equal(AI_PROVIDER_CONTROL_CONTRACT.gateway,'/api/ai-modules/v1/providers/generate');
});


test('scheduled free provider health performs a bounded real provider probe contract',async()=>{
  const writes=[];
  const row={provider_id:'gemini',enabled:1,priority:10,default_model:'gemini-3.7-flash',secret_binding:'GEMINI_API_KEY',health_status:'unknown',last_checked_at:null};
  const DB={prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},async all(){if(sql.startsWith('SELECT * FROM ai_provider_registry'))return{results:[row]};return{results:[]}},async first(){return null},async run(){writes.push({sql,args:this.args});return{meta:{changes:1}}}};return stmt}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{assert.match(String(url),/generativelanguage.googleapis.com/);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'EKODI_PROVIDER_OK'}]}}],usageMetadata:{promptTokenCount:7,candidatesTokenCount:3}}),{status:200,headers:{'content-type':'application/json'}})};
  try{const result=await runAiProviderHealthSchedule({DB,GEMINI_API_KEY:'test-key-1234567890'},{now:Date.parse('2026-09-08T00:00:00Z')});assert.equal(result.ok,true);assert.equal(result.checked,1);assert.equal(result.results[0].status,'healthy');assert.ok(writes.some(item=>item.sql.includes('UPDATE ai_provider_registry SET health_status')));assert.ok(writes.some(item=>item.sql.includes('INSERT INTO ai_provider_calls')))}finally{globalThis.fetch=originalFetch}
});

test('mission control schedules provider health without delaying core work',()=>{const source=read('mission-control-entry-worker.js');assert.match(source,/runAiProviderHealthSchedule/);assert.match(source,/ctx\.waitUntil\(aiProviderHealth\)/);});

test('scheduled paid provider health is blocked before network access',async()=>{
  let providerFetches=0;
  const row={provider_id:'openai',enabled:1,priority:10,default_model:'gpt-5.6-terra',secret_binding:'OPENAI_API_KEY',health_status:'unknown',last_checked_at:null};
  const DB={prepare(sql){const stmt={bind(){return this},async all(){if(sql.startsWith('SELECT * FROM ai_provider_registry'))return{results:[row]};return{results:[]}},async run(){return{meta:{changes:1}}}};return stmt}};
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{providerFetches+=1;throw new Error('paid_provider_should_not_be_called')};
  try{const result=await runAiProviderHealthSchedule({DB},{now:Date.parse('2026-09-08T00:00:00Z')});assert.equal(result.ok,true);assert.equal(result.checked,0);assert.equal(result.results[0].status,'cost-blocked');assert.equal(providerFetches,0)}finally{globalThis.fetch=originalFetch}
});

test('default provider capability skips paid primary and uses free fallback',async()=>{
  const calls=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{calls.push(String(url));if(String(url).includes('generativelanguage.googleapis.com'))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'free-ok'}]}}]}),{status:200,headers:{'content-type':'application/json'}});throw new Error('paid_provider_should_not_be_called')};
  try{const result=await invokeAiProviderCapability({OPENAI_API_KEY:'configured',GEMINI_API_KEY:'configured'},{input:'zero cost routing'});assert.equal(result.provider,'gemini');assert.equal(calls.some(url=>url.includes('api.openai.com')),false)}finally{globalThis.fetch=originalFetch}
});

test('trusted internal invocation may use paid provider only with explicit delegated budget',async()=>{
  const calls=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{calls.push(String(url));return new Response(JSON.stringify({model:'gpt-test',output_text:'paid-ok',usage:{input_tokens:1,output_tokens:1}}),{status:200,headers:{'content-type':'application/json'}})};
  try{const result=await invokeAiProviderCapability({OPENAI_API_KEY:'configured'},{input:'approved paid routing',governance:{paidCommitment:true,explicitDelegatedBudget:true}});assert.equal(result.provider,'openai');assert.equal(calls.some(url=>url.includes('api.openai.com')),true)}finally{globalThis.fetch=originalFetch}
});

test('provider traffic circuit breaker skips a known exhausted-credit provider',async()=>{
  let providerFetches=0;
  const provider={provider_id:'openai',enabled:1,priority:10,default_model:'gpt-5.6-terra',secret_binding:'OPENAI_API_KEY',health_status:'error',last_error:'openai_429_credit_balance_exhausted'};
  const DB={batch:async()=>[],prepare(sql){const stmt={args:[],bind(...args){this.args=args;return this},async first(){if(sql.startsWith('SELECT COUNT(*) calls'))return{calls:0,cost:0,input_tokens:0,cached_input_tokens:0,output_tokens:0};if(sql.startsWith('SELECT * FROM ai_provider_registry WHERE'))return provider;if(sql.startsWith('SELECT * FROM ai_provider_routes WHERE'))return{primary_provider:'openai',fallback_json:'[]',model_override:''};return null},async run(){return{meta:{changes:1}}}};return stmt}};
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{providerFetches+=1;throw new Error('provider_should_not_be_called')};
  try{await assert.rejects(invokeAiProviderCapability({DB,OPENAI_API_KEY:'test-key-1234567890'},{input:'health-aware routing test',governance:{paidCommitment:true,explicitDelegatedBudget:true}}),error=>error?.message==='provider_unavailable'&&error?.blocked?.includes('openai'));assert.equal(providerFetches,0)}finally{globalThis.fetch=originalFetch}
});


test('provider control exposes human-only paid decision alerts without auto escalation',()=>{
  const api=read('ai-provider-control.js'),admin=read('admin-provider-control.js');
  assert.match(api,/paidApiAutoEscalation:false/);
  assert.match(api,/paidDecisionMode:'human-only'/);
  assert.match(api,/ai-cost-alert-decision/);
  assert.match(admin,/무료 AI 사용 한도 소진|무료 AI 한도 알림/);
  assert.match(admin,/무료 유지/);
  assert.match(admin,/유료 설정 검토/);
  assert.doesNotMatch(admin,/자동 결제/);
});


test('provider admin presents compact explicit connection status without exposing secrets',()=>{
  const admin=read('admin-provider-control.js');
  assert.match(admin,/AI-PROVIDER-COMPACT-READABLE-20261001/);
  assert.match(admin,/Secret \$\{configured\?'연결':'미연결'\}/);
  assert.match(admin,/운영 \$\{operational\?'가동':'비가동'\}/);
  assert.match(admin,/계정 자원 연결/);
  assert.match(admin,/aria-live="polite"/);
  assert.match(admin,/grid-template-columns:repeat\(3,minmax\(285px,1fr\)\)/);
  assert.match(admin,/min-height:30px/);
  assert.doesNotMatch(admin,/type="text"[^>]*data-ai-field="secret"/);
});

test('runtime secret sync retries transient Cloudflare failures and reports the failing worker without the value',async()=>{
  const { putProviderRuntimeSecret, describeProviderRuntimeSyncFailure }=await import('../ai-provider-control.js');
  const env={CLOUDFLARE_SECRET_MANAGER_TOKEN:'manager-token',CLOUDFLARE_ACCOUNT_ID:'acct',AI_PROVIDER_RUNTIME_SCRIPTS:'worker-a,worker-b'};
  const original=globalThis.fetch,calls=[];
  try{
    let flaky=1;
    globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:init.body});if(String(url).includes('worker-a')&&flaky-->0)return new Response(JSON.stringify({success:false,errors:[{code:10013}]}),{status:500});return new Response(JSON.stringify({success:true}),{status:200})};
    assert.deepEqual(await putProviderRuntimeSecret(env,'EKODI_PROVIDER_ANTHROPIC_MODEL','claude-sonnet-5-5'),['worker-a','worker-b']);
    assert.equal(calls.length,3);
    calls.length=0;
    globalThis.fetch=async url=>{calls.push(String(url));if(String(url).includes('worker-b'))return new Response(JSON.stringify({success:false,errors:[{code:10215,message:'latest version not deployed'}]}),{status:400});return new Response(JSON.stringify({success:true}),{status:200})};
    const error=await putProviderRuntimeSecret(env,'ANTHROPIC_API_KEY','sk-ant-secret-value-123456').catch(e=>e);
    assert.equal(calls.length,2,'version mismatch must fail closed without deploying an unapproved latest version');
    const failure=describeProviderRuntimeSyncFailure(error);
    assert.equal(failure.reason,'worker_latest_version_not_deployed');
    assert.equal(failure.target,'worker-b');
    assert.equal(failure.status,400);
    assert.equal(failure.cfCode,10215);
    assert.equal(failure.providerMessage,'latest version not deployed');
    assert.deepEqual(failure.updatedTargets,['worker-a']);
    assert.equal(JSON.stringify(failure).includes('sk-ant'),false);
    assert.equal(describeProviderRuntimeSyncFailure(Object.assign(new Error('x'),{scriptName:'w',status:403})).reason,'secret_manager_permission_denied');
    assert.equal(describeProviderRuntimeSyncFailure(new Error('provider_runtime_sync_unavailable')).reason,'secret_manager_not_configured');
  }finally{globalThis.fetch=original}
});

test('admin provider UI explains runtime sync failures instead of showing the raw code',()=>{
  const ui=read('admin-provider-control.js');
  assert.match(ui,/code==='provider_runtime_sync_failed'/);
  assert.match(ui,/worker_latest_version_not_deployed/);
  assert.match(ui,/renderAll\(\)\}catch\(e\)\{message\(card,providerControlErrorMessage\(e\),true\)\}/);
});


test('provider status cards explain free and paid usage',()=>{
  const admin=read('admin-provider-control.js');
  assert.match(admin,/Gemini 무료 한도 우선/);
  assert.match(admin,/OpenRouter Free/);
  assert.match(admin,/Groq Free/);
  assert.match(admin,/명시적 예산\/승인 필요/);
  assert.match(admin,/ekodi-ai-provider-status-note/);
});


test('common provider contract exposes canonical free-first six-provider order',()=>{
  assert.deepEqual(AI_PROVIDER_CONTROL_CONTRACT.providerOrder,[
    'cloudflare-workers-ai','gemini','openrouter-free','groq-free','openai','anthropic'
  ]);
  const migration=read('migrations/0120_common_ai_provider_chain.sql');
  assert.match(migration,/Cloudflare \/ 무료 자원/);
  assert.match(migration,/\["gemini","openrouter-free","groq-free","openai","anthropic"\]/);
  assert.match(migration,/OpenAI · 유료 승인/);
  assert.match(migration,/Claude · 유료 승인/);
});

test('provider admin shows the canonical chain and secretless Cloudflare card contract',()=>{
  const admin=read('admin-provider-control.js');
  assert.match(admin,/Cloudflare \/ 무료 자원/);
  assert.match(admin,/Gemini Free/);
  assert.match(admin,/OpenRouter Free/);
  assert.match(admin,/Groq Free/);
  assert.match(admin,/OpenAI · 유료 승인/);
  assert.match(admin,/Claude · 유료 승인/);
  assert.match(admin,/API Key 없음/);
  assert.match(admin,/canonicalFallbacks/);
});

test('provider health probes allocate enough output budget for thinking-era models and preserve safe provider diagnostics',()=>{
  const api=read('ai-provider-control.js');
  assert.match(api,/id==='anthropic'\?512:id==='gemini'\?256:64/);
  assert.match(api,/error\.providerMessage=message/);
  assert.match(api,/providerMessage:clean\(error\?\.providerMessage,320\)/);
  assert.match(api,/requestId:clean\(error\?\.requestId,120\)/);
});