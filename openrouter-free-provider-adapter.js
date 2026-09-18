import { reserveFreeDailyRequest } from './ai-free-quota.js';
import { projectForExternalAi } from './secure-projection.js';

const DEFAULT_MODEL='openrouter/free';
const DEFAULT_DAILY_LIMIT=45;
const MAX_DAILY_LIMIT=50;
const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const number=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
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
    async invoke({prompt='' }={}){
      if(!available)throw new Error('openrouter_free_not_configured');
      const reservation=await reserveFreeDailyRequest(env,'openrouter-free',dailyLimit(env));
      const projected=await projectForExternalAi({prompt:clean(prompt,24000)},{profile:'ai_minimum',purpose:'ekodi-free-provider',salt:crypto.randomUUID()});
      const safePrompt=clean(projected?.prompt||JSON.stringify(projected),24000);
      const response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','HTTP-Referer':'https://ekodi.kr','X-OpenRouter-Title':'EKODI AI Control'},body:JSON.stringify({model,messages:[{role:'user',content:safePrompt}],temperature:0.2,max_tokens:1024}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw errorFromResponse(response,data);
      const output=clean(data?.choices?.[0]?.message?.content,40000);if(!output)throw new Error('openrouter_free_empty_response');
      return Object.freeze({text:output,model,quota:Object.freeze({remainingRequests:reservation.remaining,remainingTokens:null,resetAt:reservation.resetAt})});
    }
  });
}
export const OPENROUTER_FREE_DEFAULTS=Object.freeze({model:DEFAULT_MODEL,dailySafetyLimit:DEFAULT_DAILY_LIMIT,maxDailyLimit:MAX_DAILY_LIMIT});
