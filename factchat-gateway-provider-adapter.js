// FACTCHAT-DUAL-ACCOUNT-20261021: one OpenAI-compatible adapter, two strictly separated accounts.
//  - ekodi:       EKODI's own FactChat/BAZE gateway key. Credits are an EKODI spend (paid opt-in).
//  - institution: the 국립목포대학교 institutional key from mokpo.factchat.bot/dashboard/developers.
//                 Used only after a Super Administrator explicitly approves institutional use.
// Each account has its own secret binding, base URL, approval flag and usage-funding label,
// so a key or credit pool can never leak into the other account's traffic.
import { projectForExternalAi } from './secure-projection.js';

export const FACTCHAT_GATEWAY_DEFAULT_BASE_URL='https://factchat-cloud.mindlogic.ai/v1/gateway';
const DEFAULT_MODEL='gpt-5.6-luna';
const DEFAULT_OUTPUT_TOKENS=2048;
const MAX_OUTPUT_TOKENS=8192;
const ENABLED=new Set(['1','true','yes','on','enabled']);
const clean=(value,max=40000)=>String(value??'').trim().slice(0,max);
const on=value=>ENABLED.has(clean(value,20).toLowerCase());

export const FACTCHAT_ACCOUNTS=Object.freeze({
  ekodi:Object.freeze({
    providerId:'factchat-ekodi',
    keyBinding:'FACTCHAT_EKODI_API_KEY',
    baseUrlBinding:'FACTCHAT_EKODI_BASE_URL',
    modelBinding:'EKODI_FACTCHAT_EKODI_MODEL',
    enabledBinding:'EKODI_PROVIDER_FACTCHAT_EKODI_ENABLED',
    approvalBinding:'',
    funding:'ekodi-sponsored',
    costClass:'paid-opt-in',
    purpose:'ekodi-factchat-gateway',
  }),
  institution:Object.freeze({
    providerId:'factchat-institution',
    keyBinding:'FACTCHAT_MOKPO_API_KEY',
    baseUrlBinding:'FACTCHAT_MOKPO_BASE_URL',
    modelBinding:'EKODI_FACTCHAT_INSTITUTION_MODEL',
    enabledBinding:'EKODI_PROVIDER_FACTCHAT_INSTITUTION_ENABLED',
    approvalBinding:'EKODI_FACTCHAT_INSTITUTION_USE_APPROVED',
    funding:'institution-sponsored',
    costClass:'account-managed',
    purpose:'mnu-factchat-institution',
  }),
});

export function factChatAccount(accountOrProviderId=''){
  const value=clean(accountOrProviderId,80).toLowerCase();
  return FACTCHAT_ACCOUNTS[value]||Object.values(FACTCHAT_ACCOUNTS).find(item=>item.providerId===value)||null;
}

// Only an https origin is accepted; anything else falls back to the official gateway so a
// mistyped variable cannot redirect a key to an arbitrary host.
export function factChatBaseUrl(env={},account){
  const raw=clean(env?.[account?.baseUrlBinding],400).replace(/\/+$/,'');
  if(!raw)return FACTCHAT_GATEWAY_DEFAULT_BASE_URL;
  try{const url=new URL(raw);if(url.protocol==='https:'&&/(^|\.)mindlogic\.ai$|(^|\.)factchat\.bot$/.test(url.hostname))return raw}catch{}
  return FACTCHAT_GATEWAY_DEFAULT_BASE_URL;
}

export function factChatApprovalConfirmed(env={},account){
  if(!account?.approvalBinding)return true;
  return on(env?.[account.approvalBinding]);
}

// OpenAI reasoning-family models reject max_tokens and non-default temperature through the gateway.
function tokenField(model){return /^(gpt-|o\d)/i.test(model)?'max_completion_tokens':'max_tokens'}
function outputTokens(value){const n=Math.floor(Number(value));return Math.max(64,Math.min(MAX_OUTPUT_TOKENS,Number.isFinite(n)?n:DEFAULT_OUTPUT_TOKENS))}

function gatewayError(account,response,data){
  const detail=clean(data?.detail?.message||data?.error?.message||data?.error?.code||(typeof data?.detail==='string'?data.detail:''),200).toLowerCase().replace(/[^a-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');
  const error=new Error(`${account.providerId.replace(/-/g,'_')}_${response.status}${detail?`_${detail}`:''}`);
  error.status=response.status;
  error.providerMessage=clean(data?.detail?.message||data?.error?.message||'',320);
  const retry=Number(response.headers?.get?.('retry-after'));if(Number.isFinite(retry)&&retry>0)error.retryAfterSeconds=retry;
  if(response.status===429)error.quota={state:'throttled'};
  if(response.status===402)error.quota={state:'exhausted'};
  return error;
}

export function createFactChatGatewayProvider(env={},options={}){
  const account=factChatAccount(options.account);
  if(!account)throw new Error('factchat_account_required');
  const key=clean(env?.[account.keyBinding],8192);
  const model=clean(options.model||env?.[account.modelBinding],180)||DEFAULT_MODEL;
  const base=factChatBaseUrl(env,account);
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const enabledFlag=env?.[account.enabledBinding]===undefined?true:on(env[account.enabledBinding]);
  const approved=factChatApprovalConfirmed(env,account);
  const available=Boolean(enabledFlag&&approved&&key&&typeof fetchImpl==='function');
  return Object.freeze({
    id:account.providerId,account:account===FACTCHAT_ACCOUNTS.ekodi?'ekodi':'institution',model,available,costClass:account.costClass,funding:account.funding,
    async invoke({system='',input='',prompt='',maxOutputTokens}={}){
      if(!key)throw new Error(`${account.providerId.replace(/-/g,'_')}_not_configured`);
      if(!approved)throw new Error('factchat_institution_use_not_approved');
      if(!enabledFlag)throw new Error(`${account.providerId.replace(/-/g,'_')}_disabled`);
      const userText=clean(input||prompt,24000);
      if(!userText)throw new Error('input_required');
      // Data minimisation: only the projected minimum leaves EKODI, for either account.
      const projected=await projectForExternalAi({prompt:userText},{profile:'ai_minimum',purpose:account.purpose,salt:crypto.randomUUID()});
      const safeInput=clean(projected?.prompt||JSON.stringify(projected),24000);
      const messages=[...(clean(system,12000)?[{role:'system',content:clean(system,12000)}]:[]),{role:'user',content:safeInput}];
      const response=await fetchImpl(`${base}/chat/completions/`,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages,[tokenField(model)]:outputTokens(maxOutputTokens),stream:false}),signal:AbortSignal.timeout(60000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw gatewayError(account,response,data);
      const text=clean(data?.choices?.[0]?.message?.content,40000);
      if(!text)throw new Error(`${account.providerId.replace(/-/g,'_')}_empty_response`);
      return Object.freeze({text,model:clean(data?.model,180)||model,usage:Object.freeze({inputTokens:Number(data?.usage?.prompt_tokens||0),outputTokens:Number(data?.usage?.completion_tokens||0)})});
    }
  });
}

// Zero-credit credential proof: listing models authenticates the key without generating tokens.
export async function probeFactChatGatewayCredential(env={},options={}){
  const account=factChatAccount(options.account);
  if(!account)throw new Error('factchat_account_required');
  const key=clean(env?.[account.keyBinding],8192);
  if(!key)throw new Error(`${account.providerId.replace(/-/g,'_')}_not_configured`);
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const response=await fetchImpl(`${factChatBaseUrl(env,account)}/models/?type=llm`,{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw gatewayError(account,response,data);
  const models=Array.isArray(data?.data)?data.data.length:Array.isArray(data)?data.length:null;
  return{ok:true,quota:null,models};
}

export const FACTCHAT_GATEWAY_DEFAULTS=Object.freeze({baseUrl:FACTCHAT_GATEWAY_DEFAULT_BASE_URL,model:DEFAULT_MODEL,defaultOutputTokens:DEFAULT_OUTPUT_TOKENS,maxOutputTokens:MAX_OUTPUT_TOKENS});
