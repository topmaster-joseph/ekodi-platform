const VERSION=1;
const BINDING='EKODI_WRITE_QUEUE';

const clean=(value,max=240)=>String(value??'').trim().slice(0,max);

export function durableWriteQueueAvailable(env){
  return Boolean(env?.[BINDING]&&typeof env[BINDING].send==='function');
}

export async function enqueueDurableWrite(env,{kind,workspaceId,idempotencyKey,payload,acceptedAt}={}){
  const type=clean(kind,120),workspace=clean(workspaceId,160),key=clean(idempotencyKey,240);
  if(!type||!workspace||!key||!payload||typeof payload!=='object')return {ok:false,error:'invalid_write_envelope'};
  if(!durableWriteQueueAvailable(env))return {ok:false,error:'durable_queue_unavailable'};
  const envelope={version:VERSION,kind:type,workspaceId:workspace,idempotencyKey:key,acceptedAt:acceptedAt||new Date().toISOString(),payload};
  await env[BINDING].send(envelope,{contentType:'json'});
  return {ok:true,idempotencyKey:key,acceptedAt:envelope.acceptedAt};
}

export const EKODI_WRITE_INGRESS=Object.freeze({
  version:VERSION,
  binding:BINDING,
  successRule:'durable_queue_acceptance_required_before_success_response',
  productionFallback:'fail_closed',
  retryOwnership:'queue_consumer',
  idempotencyRequired:true
});
