export const CHANNELS=Object.freeze(['kakao','whatsapp','telegram','email','sms']);
const CHANNEL_SET=new Set(CHANNELS);
const clean=(value,max=2000)=>String(value??'').trim().slice(0,max);

export function normalizeChannel(value){
  const channel=clean(value,40).toLowerCase();
  return CHANNEL_SET.has(channel)?channel:'';
}

export function buildChannelEnvelope({channel,threadId,messageId,body,externalThreadId='',metadata={}}={}){
  const normalized=normalizeChannel(channel);
  if(!normalized||!Number(threadId)||!clean(body,8000))return null;
  return Object.freeze({
    version:1,
    channel:normalized,
    threadId:Number(threadId),
    messageId:Number(messageId)||null,
    externalThreadId:clean(externalThreadId,240),
    body:clean(body,8000),
    metadata:metadata&&typeof metadata==='object'?metadata:{},
  });
}

function bindingName(channel){return `CHANNEL_${String(channel||'').toUpperCase()}`}
function urlName(channel){return `CHANNEL_${String(channel||'').toUpperCase()}_URL`}
function tokenName(channel){return `CHANNEL_${String(channel||'').toUpperCase()}_TOKEN`}

export async function dispatchChannelEnvelope(env,envelope){
  if(!envelope)return {delivered:false,retryable:false,error:'INVALID_CHANNEL_ENVELOPE'};
  const channel=envelope.channel;
  const binding=env?.[bindingName(channel)];
  if(binding&&typeof binding.fetch==='function'){
    try{
      const response=await binding.fetch('https://ekodi.internal/channel/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
      if(!response.ok)return {delivered:false,retryable:response.status>=500,error:`CHANNEL_BINDING_HTTP_${response.status}`};
      const data=await response.json().catch(()=>({}));
      return {delivered:true,providerMessageId:clean(data?.messageId||data?.id,240),status:clean(data?.status||'sent',40)};
    }catch(error){return {delivered:false,retryable:true,error:clean(error?.message||error,500)}}
  }
  const endpoint=clean(env?.[urlName(channel)],2048);
  if(endpoint){
    let parsed;try{parsed=new URL(endpoint)}catch{return {delivered:false,retryable:false,error:'INVALID_CHANNEL_URL'}}
    if(parsed.protocol!=='https:')return {delivered:false,retryable:false,error:'CHANNEL_URL_HTTPS_REQUIRED'};
    try{
      const response=await fetch(parsed.href,{method:'POST',headers:{'content-type':'application/json',...(env?.[tokenName(channel)]?{authorization:`Bearer ${env[tokenName(channel)]}`}:{})},body:JSON.stringify(envelope),signal:AbortSignal.timeout(5000)});
      if(!response.ok)return {delivered:false,retryable:response.status>=500,error:`CHANNEL_HTTP_${response.status}`};
      const data=await response.json().catch(()=>({}));
      return {delivered:true,providerMessageId:clean(data?.messageId||data?.id,240),status:clean(data?.status||'sent',40)};
    }catch(error){return {delivered:false,retryable:true,error:clean(error?.message||error,500)}}
  }
  return {delivered:false,retryable:true,error:'CHANNEL_ADAPTER_NOT_CONFIGURED'};
}
