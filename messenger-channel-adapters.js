export const CHANNELS=Object.freeze(['kakao','whatsapp','telegram','email','sms']);
const CHANNEL_SET=new Set(CHANNELS);
const clean=(value,max=2000)=>String(value??'').trim().slice(0,max);
const secret=(env,name)=>clean(env?.[name],8192);

export function normalizeChannel(value){
  const channel=clean(value,40).toLowerCase();
  return CHANNEL_SET.has(channel)?channel:'';
}

export function buildChannelEnvelope({channel,threadId,messageId,body,externalThreadId='',metadata={}}={}){
  const normalized=normalizeChannel(channel);
  if(!normalized||!Number(threadId)||!clean(body,8000))return null;
  return Object.freeze({version:1,channel:normalized,threadId:Number(threadId),messageId:Number(messageId)||null,externalThreadId:clean(externalThreadId,240),body:clean(body,8000),metadata:metadata&&typeof metadata==='object'?metadata:{}});
}

function bindingName(channel){return `CHANNEL_${String(channel||'').toUpperCase()}`}
function urlName(channel){return `CHANNEL_${String(channel||'').toUpperCase()}_URL`}
function tokenName(channel){return `CHANNEL_${String(channel||'').toUpperCase()}_TOKEN`}
function httpsUrl(value){try{const url=new URL(clean(value,2048));return url.protocol==='https:'?url:null}catch{return null}}

export function channelConfigurationStatus(env={}){
  return CHANNELS.map(channel=>{
    const binding=env?.[bindingName(channel)];
    if(binding&&typeof binding.fetch==='function')return {channel,configured:true,mode:'service_binding'};
    if(channel==='telegram'&&secret(env,'CHANNEL_TELEGRAM_TOKEN'))return {channel,configured:true,mode:'telegram_bot_api'};
    if(channel==='whatsapp'&&secret(env,'CHANNEL_WHATSAPP_TOKEN')&&secret(env,'CHANNEL_WHATSAPP_PHONE_NUMBER_ID'))return {channel,configured:true,mode:'whatsapp_cloud_api'};
    if(channel==='kakao'&&httpsUrl(env?.CHANNEL_KAKAO_URL))return {channel,configured:true,mode:'kakao_business_provider'};
    if(httpsUrl(env?.[urlName(channel)]))return {channel,configured:true,mode:'provider_webhook'};
    return {channel,configured:false,mode:'unconfigured'};
  });
}

async function parseProviderResponse(response){
  const data=await response.json().catch(()=>({}));
  const providerMessageId=clean(data?.messageId||data?.message_id||data?.id||data?.messages?.[0]?.id||data?.result?.message_id,240);
  return {providerMessageId,status:clean(data?.status||'sent',40)};
}

async function postJson(url,{headers={},body,timeout=7000}={}){
  try{
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
    if(!response.ok)return {delivered:false,retryable:response.status===429||response.status>=500,error:`CHANNEL_HTTP_${response.status}`};
    return {delivered:true,...await parseProviderResponse(response)};
  }catch(error){return {delivered:false,retryable:true,error:clean(error?.message||error,500)}}
}

async function telegram(env,envelope){
  const token=secret(env,'CHANNEL_TELEGRAM_TOKEN');
  if(!token)return null;
  const chatId=clean(envelope.externalThreadId,240);
  if(!chatId)return {delivered:false,retryable:false,error:'TELEGRAM_CHAT_ID_REQUIRED'};
  const url=httpsUrl(`https://api.telegram.org/bot${token}/sendMessage`);
  return postJson(url.href,{body:{chat_id:chatId,text:envelope.body,disable_web_page_preview:true}});
}

async function whatsapp(env,envelope){
  const token=secret(env,'CHANNEL_WHATSAPP_TOKEN');
  const phoneNumberId=secret(env,'CHANNEL_WHATSAPP_PHONE_NUMBER_ID');
  if(!token||!phoneNumberId)return null;
  const to=clean(envelope.externalThreadId,80).replace(/[^0-9]/g,'');
  if(!to)return {delivered:false,retryable:false,error:'WHATSAPP_RECIPIENT_REQUIRED'};
  const version=clean(env?.CHANNEL_WHATSAPP_GRAPH_VERSION,40).replace(/[^a-zA-Z0-9._-]/g,'');
  const base=version?`https://graph.facebook.com/${version}`:'https://graph.facebook.com';
  const url=httpsUrl(`${base}/${encodeURIComponent(phoneNumberId)}/messages`);
  return postJson(url.href,{headers:{authorization:`Bearer ${token}`},body:{messaging_product:'whatsapp',to,type:'text',text:{body:envelope.body,preview_url:false}}});
}

async function genericProvider(env,envelope){
  const channel=envelope.channel;
  const endpoint=httpsUrl(env?.[urlName(channel)]);
  if(!endpoint)return null;
  const token=secret(env,tokenName(channel));
  return postJson(endpoint.href,{headers:token?{authorization:`Bearer ${token}`}:{},body:envelope});
}

export async function dispatchChannelEnvelope(env,envelope){
  if(!envelope)return {delivered:false,retryable:false,error:'INVALID_CHANNEL_ENVELOPE'};
  const channel=envelope.channel;
  const binding=env?.[bindingName(channel)];
  if(binding&&typeof binding.fetch==='function'){
    try{
      const response=await binding.fetch('https://ekodi.internal/channel/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
      if(!response.ok)return {delivered:false,retryable:response.status===429||response.status>=500,error:`CHANNEL_BINDING_HTTP_${response.status}`};
      return {delivered:true,...await parseProviderResponse(response)};
    }catch(error){return {delivered:false,retryable:true,error:clean(error?.message||error,500)}}
  }

  if(channel==='telegram'){
    const result=await telegram(env,envelope);if(result)return result;
  }
  if(channel==='whatsapp'){
    const result=await whatsapp(env,envelope);if(result)return result;
  }

  // Kakao business/customer notifications intentionally use an approved business-message
  // provider endpoint. The standard Kakao Talk Message API is not treated as a generic
  // arbitrary-customer delivery channel.
  const provider=await genericProvider(env,envelope);
  if(provider)return provider;
  return {delivered:false,retryable:true,error:'CHANNEL_ADAPTER_NOT_CONFIGURED'};
}
