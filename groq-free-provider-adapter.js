import { reserveFreeDailyRequest } from './ai-free-quota.js';

const DEFAULT_MODEL='openai/gpt-oss-20b';
const DEFAULT_DAILY_LIMIT=900;
const MAX_DAILY_LIMIT=1000;
const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const number=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const dailyLimit=env=>Math.max(1,Math.min(MAX_DAILY_LIMIT,Math.floor(number(env.EKODI_GROQ_FREE_DAILY_CALL_LIMIT,DEFAULT_DAILY_LIMIT))));
const headerNumber=(headers,name)=>{const value=headers.get(name);if(value===null)return null;const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):null};

function errorFromResponse(response,data){
  const detail=clean(data?.error?.code||data?.error?.type||data?.error?.message,160).toLowerCase().replace(/[^a-z0-9._-]+/g,'_');
  const error=new Error(`groq_${response.status}${detail?`_${detail}`:''}`);
  error.status=response.status;
  const retry=Number(response.headers.get('retry-after'));if(Number.isFinite(retry)&&retry>0)error.retryAfterSeconds=retry;
  if(response.status===429){
    const message=clean(data?.error?.message,600).toLowerCase();
    error.quota={state:/daily|per day|\brpd\b/.test(message)?'exhausted':'throttled',remainingRequests:headerNumber(response.headers,'x-ratelimit-remaining-requests'),remainingTokens:headerNumber(response.headers,'x-ratelimit-remaining-tokens')};
  }
  return error;
}

export function createGroqFreeProvider(env={},options={}){
  const key=clean(env.GROQ_API_KEY,8192),model=clean(env.EKODI_GROQ_FREE_MODEL||env.GROQ_MODEL,180)||DEFAULT_MODEL,fetchImpl=options.fetchImpl||globalThis.fetch;
  const enabled=['1','true','yes','on','enabled'].includes(clean(env.EKODI_PROVIDER_GROQ_FREE_ENABLED,20).toLowerCase());
  const available=Boolean(enabled&&key&&typeof fetchImpl==='function');
  return Object.freeze({
    id:'groq-free',model,available,priority:25,costClass:'free-preferred',
    async invoke({prompt='' }={}){
      if(!available)throw new Error('groq_free_not_configured');
      const reservation=await reserveFreeDailyRequest(env,'groq-free',dailyLimit(env));
      const response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:clean(prompt,24000)}],temperature:0.2,max_completion_tokens:1024}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw errorFromResponse(response,data);
      const output=clean(data?.choices?.[0]?.message?.content,40000);if(!output)throw new Error('groq_free_empty_response');
      return Object.freeze({text:output,model,quota:Object.freeze({remainingRequests:headerNumber(response.headers,'x-ratelimit-remaining-requests')??reservation.remaining,remainingTokens:headerNumber(response.headers,'x-ratelimit-remaining-tokens'),resetAt:reservation.resetAt})});
    }
  });
}
export const GROQ_FREE_DEFAULTS=Object.freeze({model:DEFAULT_MODEL,dailySafetyLimit:DEFAULT_DAILY_LIMIT,maxDailyLimit:MAX_DAILY_LIMIT});
