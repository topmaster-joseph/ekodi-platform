import { reserveFreeDailyRequest } from './ai-free-quota.js';
import { projectForExternalAi } from './secure-projection.js';

const DEFAULT_MODEL='openrouter/free';
const DEFAULT_DAILY_LIMIT=45;
// OpenRouter raises :free daily requests from 50 to 1,000 after a lifetime $10 credit purchase.
// The real counter is read from GET /api/v1/key, so the local cap may follow the account's real limit.
const MAX_DAILY_LIMIT=1000;
const DEFAULT_OUTPUT_TOKENS=2048;
const MAX_OUTPUT_TOKENS=8192;
const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const number=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const outputTokens=value=>Math.max(64,Math.min(MAX_OUTPUT_TOKENS,Math.floor(number(value,DEFAULT_OUTPUT_TOKENS))));
const dailyLimit=env=>Math.max(1,Math.min(MAX_DAILY_LIMIT,Math.floor(number(env.EKODI_OPENROUTER_FREE_DAILY_CALL_LIMIT,DEFAULT_DAILY_LIMIT))));

function errorFromResponse(response,data){
  const detail=clean(data?.error?.code||data?.error?.message,160).toLowerCase().replace(/[^a-z0-9._-]+/g,'_');
  const error=new Error(`openrouter_${response.status}${detail?`_${detail}`:''}`);
  error.status=response.status;
  const retry=Number(response.headers.get('retry-after'));if(Number.isFinite(retry)&&retry>0)error.retryAfterSeconds=retry;
  if(response.status===429){const message=clean(data?.error?.message,600).toLowerCase();error.quota={state:/daily|per day|free limit|requests/.test(message)?'exhausted':'throttled'};}
  return error;
}

export function createOpenRouterFreeProvider(env={},options={}){
  const key=clean(env.OPENROUTER_API_KEY,8192),model=clean(env.EKODI_OPENROUTER_FREE_MODEL||env.OPENROUTER_MODEL,180)||DEFAULT_MODEL,fetchImpl=options.fetchImpl||globalThis.fetch;
  const enabled=['1','true','yes','on','enabled'].includes(clean(env.EKODI_PROVIDER_OPENROUTER_FREE_ENABLED,20).toLowerCase());
  const available=Boolean(enabled&&key&&typeof fetchImpl==='function');
  return Object.freeze({
    id:'openrouter-free',model,available,priority:20,costClass:'free-preferred',
    async invoke({prompt='',maxOutputTokens}={}){
      if(!available)throw new Error('openrouter_free_not_configured');
      const reservation=await reserveFreeDailyRequest(env,'openrouter-free',dailyLimit(env));
      const projected=await projectForExternalAi({prompt:clean(prompt,24000)},{profile:'ai_minimum',purpose:'ekodi-free-provider',salt:crypto.randomUUID()});
      const safePrompt=clean(projected?.prompt||JSON.stringify(projected),24000);
      const response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','HTTP-Referer':'https://ekodi.kr','X-OpenRouter-Title':'EKODI AI Control'},body:JSON.stringify({model,messages:[{role:'user',content:safePrompt}],temperature:0.2,max_tokens:outputTokens(maxOutputTokens),reasoning:{effort:'low',exclude:true}}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw errorFromResponse(response,data);
      const output=clean(data?.choices?.[0]?.message?.content,40000);
      if(!output){const finish=clean(data?.choices?.[0]?.finish_reason,40).toLowerCase().replace(/[^a-z_]+/g,'');throw new Error(`openrouter_free_empty_response${finish?`_${finish}`:''}`)}
      return Object.freeze({text:output,model,quota:Object.freeze({remainingRequests:reservation.remaining,remainingTokens:null,resetAt:reservation.resetAt})});
    }
  });
}
export const OPENROUTER_FREE_DEFAULTS=Object.freeze({model:DEFAULT_MODEL,dailySafetyLimit:DEFAULT_DAILY_LIMIT,maxDailyLimit:MAX_DAILY_LIMIT,defaultOutputTokens:DEFAULT_OUTPUT_TOKENS,maxOutputTokens:MAX_OUTPUT_TOKENS});

const quotaNumber=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):null};
function nextUtcDay(nowMs=Date.now()){const d=new Date(nowMs);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)).toISOString()}
// Zero-quota probe: GET /api/v1/key validates the key and reports the free-model counter OpenRouter enforces.
export async function probeOpenRouterFreeCredential(env={},options={}){
  const key=clean(env.OPENROUTER_API_KEY,8192),fetchImpl=options.fetchImpl||globalThis.fetch;
  if(!key)throw new Error('openrouter_free_not_configured');
  const response=await fetchImpl('https://openrouter.ai/api/v1/key',{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw errorFromResponse(response,data);
  const daily=data?.data?.free_model_daily_requests||{};
  const limit=quotaNumber(daily.limit),remaining=quotaNumber(daily.remaining),used=quotaNumber(daily.used);
  return Object.freeze({ok:true,quota:Object.freeze({limit,remainingRequests:remaining,used,resetAt:nextUtcDay()}),isFreeTier:data?.data?.is_free_tier===true});
}
