import { reserveFreeDailyRequest } from './ai-free-quota.js';
import { projectForExternalAi } from './secure-projection.js';

const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const enabled=value=>['1','true','yes','on','enabled'].includes(clean(value,20).toLowerCase());
const number=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const safeLimit=(value,fallback,max)=>Math.max(1,Math.min(max,Math.floor(number(value,fallback))));
const safePrompt=async(prompt,purpose)=>{
  const projected=await projectForExternalAi({prompt:clean(prompt,24000)},{profile:'ai_minimum',purpose,salt:crypto.randomUUID()});
  return clean(projected?.prompt||JSON.stringify(projected),24000);
};
const detailCode=(prefix,response,data)=>{
  const detail=clean(data?.error?.code||data?.error?.type||data?.error?.message,160).toLowerCase().replace(/[^a-z0-9._-]+/g,'_');
  const error=new Error(`${prefix}_${response.status}${detail?`_${detail}`:''}`);
  error.status=response.status;
  const retry=Number(response.headers.get('retry-after'));if(Number.isFinite(retry)&&retry>0)error.retryAfterSeconds=retry;
  if(response.status===429)error.quota={state:'throttled'};
  return error;
};
const chatOutput=data=>clean(data?.choices?.[0]?.message?.content,40000);

export function createCerebrasFreeProvider(env={},options={}){
  const key=clean(env.CEREBRAS_API_KEY,8192),model=clean(env.EKODI_CEREBRAS_FREE_MODEL||env.CEREBRAS_MODEL,180)||'qwen-3.8-27b',fetchImpl=options.fetchImpl||globalThis.fetch;
  const trialOnly=enabled(env.EKODI_CEREBRAS_FREE_TRIAL_ONLY);
  const available=Boolean(enabled(env.EKODI_PROVIDER_CEREBRAS_FREE_ENABLED)&&trialOnly&&key&&typeof fetchImpl==='function');
  return Object.freeze({
    id:'cerebras-free',model,available,priority:40,costClass:'free-preferred',
    async invoke({prompt=''}={}){
      if(!available)throw new Error(trialOnly?'cerebras_free_not_configured':'cerebras_free_trial_not_confirmed');
      const reservation=await reserveFreeDailyRequest(env,'cerebras-free',safeLimit(env.EKODI_CEREBRAS_FREE_DAILY_CALL_LIMIT,100,250));
      const input=await safePrompt(prompt,'ekodi-cerebras-free-trial');
      const response=await fetchImpl('https://api.cerebras.ai/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:input}],temperature:0.2,max_tokens:1024}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=detailCode('cerebras',response,data);if([402,403].includes(response.status))error.quota={state:'exhausted'};throw error}
      const text=chatOutput(data);if(!text)throw new Error('cerebras_free_empty_response');
      return Object.freeze({text,model,quota:Object.freeze({remainingRequests:reservation.remaining,remainingTokens:null,resetAt:reservation.resetAt})});
    }
  });
}

export function createQwenFreeProvider(env={},options={}){
  const key=clean(env.QWEN_API_KEY||env.DASHSCOPE_API_KEY,8192),model=clean(env.EKODI_QWEN_FREE_MODEL||env.QWEN_MODEL,180)||'qwen3.7-plus',fetchImpl=options.fetchImpl||globalThis.fetch;
  const base=clean(env.QWEN_BASE_URL,1000).replace(/\/+$/,'');
  const freeOnly=enabled(env.EKODI_QWEN_FREE_QUOTA_ONLY_CONFIRMED);
  const available=Boolean(enabled(env.EKODI_PROVIDER_QWEN_FREE_ENABLED)&&freeOnly&&key&&base&&typeof fetchImpl==='function');
  return Object.freeze({
    id:'qwen-free',model,available,priority:45,costClass:'free-preferred',
    async invoke({prompt=''}={}){
      if(!available)throw new Error(freeOnly?'qwen_free_not_configured':'qwen_free_quota_only_not_confirmed');
      const reservation=await reserveFreeDailyRequest(env,'qwen-free',safeLimit(env.EKODI_QWEN_FREE_DAILY_CALL_LIMIT,150,500));
      const input=await safePrompt(prompt,'ekodi-qwen-free-quota');
      const response=await fetchImpl(`${base}/chat/completions`,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:input}],temperature:0.2,max_tokens:1024}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=detailCode('qwen',response,data);if([402,429].includes(response.status))error.quota={state:response.status===402?'exhausted':'throttled'};throw error}
      const text=chatOutput(data);if(!text)throw new Error('qwen_free_empty_response');
      return Object.freeze({text,model,quota:Object.freeze({remainingRequests:reservation.remaining,remainingTokens:null,resetAt:reservation.resetAt})});
    }
  });
}

const amount=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
export function createDeepSeekFreeCreditProvider(env={},options={}){
  const key=clean(env.DEEPSEEK_API_KEY,8192),model=clean(env.EKODI_DEEPSEEK_FREE_MODEL||env.DEEPSEEK_MODEL,180)||'deepseek-flash',fetchImpl=options.fetchImpl||globalThis.fetch;
  const available=Boolean(enabled(env.EKODI_PROVIDER_DEEPSEEK_FREE_ENABLED)&&key&&typeof fetchImpl==='function');
  return Object.freeze({
    id:'deepseek-free-credit',model,available,priority:50,costClass:'free-preferred',
    async invoke({prompt=''}={}){
      if(!available)throw new Error('deepseek_free_credit_not_configured');
      const balanceResponse=await fetchImpl('https://api.deepseek.com/user/balance',{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
      const balance=await balanceResponse.json().catch(()=>({}));
      if(!balanceResponse.ok)throw detailCode('deepseek_balance',balanceResponse,balance);
      const infos=Array.isArray(balance?.balance_infos)?balance.balance_infos:[];
      const granted=infos.reduce((sum,item)=>sum+amount(item?.granted_balance),0);
      const toppedUp=infos.reduce((sum,item)=>sum+amount(item?.topped_up_balance),0);
      if(!(granted>0)||toppedUp>0){
        const error=new Error(toppedUp>0?'deepseek_paid_balance_present':'deepseek_granted_balance_exhausted');
        error.status=409;error.quota={state:'exhausted',remainingRequests:0};throw error;
      }
      const reservation=await reserveFreeDailyRequest(env,'deepseek-free-credit',safeLimit(env.EKODI_DEEPSEEK_FREE_DAILY_CALL_LIMIT,100,300));
      const input=await safePrompt(prompt,'ekodi-deepseek-granted-credit-only');
      const response=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:input}],temperature:0.2,max_tokens:1024}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw detailCode('deepseek',response,data);
      const text=chatOutput(data);if(!text)throw new Error('deepseek_free_credit_empty_response');
      return Object.freeze({text,model,quota:Object.freeze({remainingRequests:reservation.remaining,remainingTokens:null,resetAt:reservation.resetAt})});
    }
  });
}

export const EXTENDED_FREE_PROVIDER_DEFAULTS=Object.freeze({
  cerebras:Object.freeze({model:'qwen-3.8-27b',dailySafetyLimit:100}),
  qwen:Object.freeze({model:'qwen3.7-plus',dailySafetyLimit:150}),
  deepseek:Object.freeze({model:'deepseek-flash',dailySafetyLimit:100}),
});
