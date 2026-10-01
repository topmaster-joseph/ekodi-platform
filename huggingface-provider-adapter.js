import { reserveFreeDailyRequest } from './ai-free-quota.js';
import { projectForExternalAi } from './secure-projection.js';

const DEFAULT_MODEL='openai/gpt-oss-120b:cheapest';
const DEFAULT_DAILY_LIMIT=50;
const MAX_DAILY_LIMIT=200;
const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const enabled=value=>['1','true','yes','on','enabled'].includes(clean(value,20).toLowerCase());
const number=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const dailyLimit=env=>Math.max(1,Math.min(MAX_DAILY_LIMIT,Math.floor(number(env.EKODI_HF_FREE_DAILY_CALL_LIMIT,DEFAULT_DAILY_LIMIT))));

async function safePrompt(prompt){
  const projected=await projectForExternalAi(
    {prompt:clean(prompt,24000)},
    {profile:'ai_minimum',purpose:'ekodi-huggingface-free-credit',salt:crypto.randomUUID()},
  );
  return clean(projected?.prompt||JSON.stringify(projected),24000);
}

function responseError(response,data){
  const detail=clean(data?.error?.code||data?.error?.type||data?.error?.message,160).toLowerCase().replace(/[^a-z0-9._-]+/g,'_');
  const error=new Error(`huggingface_${response.status}${detail?`_${detail}`:''}`);
  error.status=response.status;
  const retry=Number(response.headers.get('retry-after'));
  if(Number.isFinite(retry)&&retry>0)error.retryAfterSeconds=retry;
  if([402,403,429].includes(response.status)){
    error.quota={state:response.status===429?'throttled':'exhausted'};
  }
  return error;
}

function promptFromInput(input={}){
  return clean(
    input.prompt||
    input.context?.prompt||
    input.context?.message||
    input.context?.request||
    '',
    24000,
  );
}

export function createHuggingFaceProvider(env={},options={}){
  const key=clean(env.HF_TOKEN||env.HUGGINGFACE_TOKEN,8192);
  const model=clean(env.EKODI_HF_FREE_MODEL||env.HF_MODEL,180)||DEFAULT_MODEL;
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const available=Boolean(enabled(env.EKODI_PROVIDER_HF_FREE_ENABLED)&&key&&typeof fetchImpl==='function');
  return Object.freeze({
    id:'huggingface-free-credit',
    model,
    available,
    priority:55,
    costClass:'free-preferred',
    capabilities:Object.freeze(['text','reasoning','code']),
    trustClass:'external',
    resourceClass:'shared-free-api',
    fundingSource:'ekodi',
    officialPath:true,
    async invoke(input={}){
      if(!available)throw new Error('huggingface_free_credit_not_configured');
      const reservation=await reserveFreeDailyRequest(env,'huggingface-free-credit',dailyLimit(env));
      const prompt=promptFromInput(input);
      if(!prompt)throw new Error('huggingface_prompt_required');
      const safe=await safePrompt(prompt);
      const response=await fetchImpl('https://router.huggingface.co/v1/chat/completions',{
        method:'POST',
        headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
        body:JSON.stringify({model,messages:[{role:'user',content:safe}],temperature:0.2,max_tokens:1024}),
        signal:AbortSignal.timeout(60000),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw responseError(response,data);
      const text=clean(data?.choices?.[0]?.message?.content,40000);
      if(!text)throw new Error('huggingface_free_credit_empty_response');
      return Object.freeze({
        text,
        model,
        usage:data?.usage||null,
        quota:Object.freeze({
          remainingRequests:reservation.remaining,
          remainingTokens:null,
          resetAt:reservation.resetAt,
        }),
      });
    },
  });
}

export const createHuggingFaceFreeCreditProvider=createHuggingFaceProvider;
export const HUGGINGFACE_PROVIDER_DEFAULTS=Object.freeze({
  model:DEFAULT_MODEL,
  dailySafetyLimit:DEFAULT_DAILY_LIMIT,
  maxDailyLimit:MAX_DAILY_LIMIT,
});
