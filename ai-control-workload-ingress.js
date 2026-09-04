const PREFIX='/api/workloads';
const MAX_EVENT_BYTES=32768;
const SECRET_KEY=/(authorization|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)/i;
const CALLER_ID=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const SCOPE_TYPES=new Set(['workspace','platform_service']);
const encoder=new TextEncoder();

const clean=(value,max=180)=>String(value??'').trim().slice(0,max);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function secureEqual(a,b){const aa=encoder.encode(String(a||''));const bb=encoder.encode(String(b||''));if(!aa.length||aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i+=1)diff|=aa[i]^bb[i];return diff===0}
function hasSecretKey(value,depth=0){if(!value||typeof value!=='object'||depth>8)return false;if(Array.isArray(value))return value.some(item=>hasSecretKey(item,depth+1));return Object.entries(value).some(([key,child])=>SECRET_KEY.test(key)||hasSecretKey(child,depth+1))}
function jsonBytes(value){try{return encoder.encode(JSON.stringify(value)).byteLength}catch{return Number.POSITIVE_INFINITY}}
function registry(env={}){try{const parsed=JSON.parse(String(env.AI_CONTROL_CALLER_REGISTRY_JSON||'[]'));return Array.isArray(parsed)?parsed.filter(item=>item&&CALLER_ID.test(String(item.id||''))&&clean(item.secretBinding)):[]}catch{return[]}}
function caller(request,env){const id=clean(request.headers.get('x-ekodi-caller-id'),64).toLowerCase();const supplied=String(request.headers.get('x-ekodi-control-plane-key')||'');if(!CALLER_ID.test(id)||!supplied)return'';const record=registry(env).find(item=>String(item.id).toLowerCase()===id&&item.enabled!==false);if(!record)return'';return secureEqual(supplied,String(env[String(record.secretBinding)]||''))?id:''}

const WORKLOADS=Object.freeze({
  'mall.product.promotion.requested':Object.freeze({
    goal:'promote_product',
    steps:Object.freeze([
      Object.freeze({capability:'campaign.compose',adapter:'campaign.default',approvalRequired:false}),
      Object.freeze({capability:'media.render.short_video',adapter:'media.default',approvalRequired:false}),
      Object.freeze({capability:'publisher.youtube.private',adapter:'social.youtube',approvalRequired:false}),
      Object.freeze({capability:'analytics.observe',adapter:'analytics.default',approvalRequired:false}),
      Object.freeze({capability:'publisher.youtube.public',adapter:'social.youtube',approvalRequired:true}),
    ]),
  }),
});

export function normalizeWorkloadEvent(input={},receivedAt=new Date().toISOString()){
  const source=object(input.source);const actor=object(input.actor);const subject=object(input.subject);const payload=object(input.payload);const scopeInput=object(input.scope);
  const sourceServiceId=clean(source.service_id||source.serviceId,120).toLowerCase();
  const workspaceId=clean(input.workspace_id||input.workspaceId,120);
  const scopeType=clean(input.scope_type||input.scopeType||scopeInput.type||(workspaceId?'workspace':''),40).toLowerCase();
  const scopeId=clean(input.scope_id||input.scopeId||scopeInput.id||(scopeType==='workspace'?workspaceId:scopeType==='platform_service'?sourceServiceId:''),120).toLowerCase();
  return Object.freeze({
    eventId:clean(input.event_id||input.eventId,120),
    eventType:clean(input.event_type||input.eventType,160),
    eventVersion:Number(input.event_version||input.eventVersion||1),
    occurredAt:clean(input.occurred_at||input.occurredAt,80)||receivedAt,
    receivedAt,
    scope:Object.freeze({type:scopeType,id:scopeId}),
    workspaceId,
    source:Object.freeze({serviceId:sourceServiceId,adapterId:clean(source.adapter_id||source.adapterId,120)}),
    actor:Object.freeze({type:clean(actor.type||'system',60),id:clean(actor.id,160)}),
    subject:Object.freeze({type:clean(subject.type,100),id:clean(subject.id,180)}),
    correlationId:clean(input.correlation_id||input.correlationId,120),
    payload,
  });
}

export function validateWorkloadEvent(event={}){
  if(!event.eventId||!event.eventType||!event.source?.serviceId||!event.subject?.type||!event.subject?.id)return Object.freeze({ok:false,code:'workload_fields_required'});
  if(event.eventVersion!==1)return Object.freeze({ok:false,code:'workload_event_version_unsupported'});
  if(!WORKLOADS[event.eventType])return Object.freeze({ok:false,code:'workload_event_unsupported'});
  if(!SCOPE_TYPES.has(event.scope?.type)||!event.scope?.id)return Object.freeze({ok:false,code:'workload_scope_required'});
  if(event.scope.type==='workspace'&&(!event.workspaceId||event.scope.id!==event.workspaceId.toLowerCase()))return Object.freeze({ok:false,code:'workload_workspace_scope_invalid'});
  if(event.scope.type==='platform_service'&&(event.workspaceId||event.scope.id!==event.source.serviceId))return Object.freeze({ok:false,code:'workload_service_scope_invalid'});
  if(hasSecretKey(event.payload))return Object.freeze({ok:false,code:'workload_secret_forbidden'});
  const bytes=jsonBytes(event);if(!Number.isFinite(bytes))return Object.freeze({ok:false,code:'workload_invalid_json'});
  if(bytes>MAX_EVENT_BYTES)return Object.freeze({ok:false,code:'workload_event_too_large'});
  return Object.freeze({ok:true,bytes});
}

export function planWorkloadEvent(event,createdAt=event.receivedAt||new Date().toISOString()){
  const contract=WORKLOADS[event.eventType];if(!contract)return null;
  const steps=contract.steps.map((step,index)=>Object.freeze({stepId:String(index+1),capability:step.capability,adapter:step.adapter,approvalRequired:step.approvalRequired,status:step.approvalRequired?'awaiting_human':'queued'}));
  return Object.freeze({
    planVersion:'1.1.0',
    eventId:event.eventId,
    correlationId:event.correlationId||event.eventId,
    scope:event.scope,
    workspaceId:event.workspaceId||'',
    sourceServiceId:event.source.serviceId,
    goal:contract.goal,
    state:'planned',
    executionReady:false,
    executionBoundary:'capability_adapters_only',
    humanApprovalRequired:steps.some(step=>step.approvalRequired),
    steps:Object.freeze(steps),
    createdAt,
  });
}

async function ensureSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_control_workload_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_version INTEGER NOT NULL,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT '',
    source_service_id TEXT NOT NULL,
    source_adapter_id TEXT NOT NULL DEFAULT '',
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    plan_json TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'planned',
    accepted_by TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  )`).run();
}

async function accept(request,env){
  if(!env.DB||typeof env.DB.prepare!=='function')return json({error:'state_store_unavailable'},503);
  const principal=caller(request,env);if(!principal)return json({error:'service_auth_required'},401);
  let input=null;try{input=await request.json()}catch{return json({error:'invalid_json'},400)}
  const event=normalizeWorkloadEvent(input);const validation=validateWorkloadEvent(event);if(!validation.ok)return json({error:validation.code},validation.code==='workload_event_too_large'?413:400);
  if(event.source.serviceId!==principal)return json({error:'caller_source_mismatch'},403);
  await ensureSchema(env.DB);
  const existing=await env.DB.prepare('SELECT plan_json,state FROM ai_control_workload_events WHERE event_id=?').bind(event.eventId).first();
  if(existing){let plan=null;try{plan=JSON.parse(existing.plan_json||'{}')}catch{plan={eventId:event.eventId,state:existing.state||'planned'}}return json({ok:true,idempotent:true,eventId:event.eventId,plan},200)}
  const plan=planWorkloadEvent(event);
  await env.DB.prepare(`INSERT INTO ai_control_workload_events
    (event_id,event_type,event_version,scope_type,scope_id,workspace_id,source_service_id,source_adapter_id,subject_type,subject_id,correlation_id,payload_json,plan_json,state,accepted_by,occurred_at,received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(event.eventId,event.eventType,event.eventVersion,event.scope.type,event.scope.id,event.workspaceId,event.source.serviceId,event.source.adapterId,event.subject.type,event.subject.id,event.correlationId,JSON.stringify(event.payload),JSON.stringify(plan),'planned',`service:${principal}`,event.occurredAt,event.receivedAt).run();
  return json({ok:true,idempotent:false,eventId:event.eventId,plan,execution:{state:'planned',note:'Execution remains with separately governed capability adapters; no external publication is claimed.'}},202);
}

export function getWorkloadIngressContract(){return Object.freeze({version:'1.1.0',eventVersion:1,path:`${PREFIX}/events`,authentication:'independent_service_caller',credentialPolicy:'server_only_secret_binding',supportedScopes:Object.freeze([...SCOPE_TYPES]),supportedEvents:Object.freeze(Object.keys(WORKLOADS)),credentialsInPayload:false});}

export async function handleWorkloadIngress(request,env={}){
  const url=new URL(request.url);if(!url.pathname.startsWith(PREFIX))return null;
  if(request.method==='POST'&&url.pathname===`${PREFIX}/events`)return accept(request,env);
  if(request.method==='GET'&&url.pathname===`${PREFIX}/contract`)return json({ok:true,contract:getWorkloadIngressContract()});
  return json({error:'not_found'},404);
}
