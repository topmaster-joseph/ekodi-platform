import { resolveWorkspacePrincipal, auditPrincipal } from './ekodi-principal.js';
import { classifyMessengerMessage } from './messenger-triage.js';
import { enqueueMessengerOutbox, drainMessengerOutbox } from './messenger-outbox.js';

const THREAD_STATES=new Set(['open','waiting_human','resolved','archived']);
const clean=(value,max=8000)=>String(value??'').trim().slice(0,max);
const safeJson=value=>{try{return JSON.stringify(value??{})}catch{return '{}'}};
const safeParse=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
const nowIso=()=>new Date().toISOString();
const toId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0};

function cors(request,env){
  const origin=String(request.headers.get('origin')||'');
  const allowedOrigins=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  const allowed=!origin||allowedOrigins.includes(origin);
  const headers={'access-control-allow-headers':'content-type, authorization, idempotency-key','access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-max-age':'86400',vary:'Origin'};
  if(origin&&allowed)headers['access-control-allow-origin']=origin;
  return {allowed,headers};
}
function json(request,env,data,status=200){const {headers}=cors(request,env);return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}})}
async function body(request){try{return await request.json()}catch{return null}}
async function recordEvent(env,threadId,eventType,actorKind,actorId,detail={}){try{await env.DB.prepare(`INSERT INTO messenger_events(thread_id,event_type,actor_kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)`).bind(threadId,eventType,actorKind,clean(actorId,240),safeJson(detail),nowIso()).run()}catch{}}
async function activeHandoff(env,threadId){return env.DB.prepare(`SELECT id,status,assigned_to_user_id FROM messenger_handoffs WHERE thread_id=? AND status IN ('requested','accepted') ORDER BY id DESC LIMIT 1`).bind(threadId).first()}
async function ensureAutomaticHandoff(env,threadId,principal,triage){
  const existing=await activeHandoff(env,threadId);if(existing)return existing;
  const now=nowIso();const inserted=await env.DB.prepare(`INSERT INTO messenger_handoffs(thread_id,requested_by_user_id,target_role,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(threadId,principal.id,'manager','requested',`자동 분류: ${triage.reasons.join(', ')||'human_review'}`,now,now).run();
  const handoffId=Number(inserted.meta?.last_row_id||0);await env.DB.prepare(`UPDATE messenger_threads SET status='waiting_human',updated_at=? WHERE id=?`).bind(now,threadId).run();await recordEvent(env,threadId,'human.review_requested','system','ekodi-triage',{handoffId,priority:triage.priority,reasons:triage.reasons});return {id:handoffId,status:'requested'};
}
async function threadForSubject(env,id,subject){return env.DB.prepare(`SELECT id,title,status,target_service,owner_user_id,created_at,updated_at FROM messenger_threads WHERE id=? AND subject_type=? AND subject_key=?`).bind(id,subject.type,subject.key).first()}
async function queueAssistant(env,executionCtx,{threadId,messageId,message,triage}){
  const row=await enqueueMessengerOutbox(env,{threadId,messageId,eventType:'message.user.created',consumer:'assistant',payload:{message,triage},idempotencyKey:`assistant:message:${messageId}`});
  if(executionCtx?.waitUntil)executionCtx.waitUntil(drainMessengerOutbox(env,{limit:4}).catch(()=>({processed:0})));
  return row?{queued:true,outboxId:row.id,status:row.status,priority:triage.priority,requiresHuman:triage.requiresHuman}:{queued:false,status:'queue_unavailable',priority:triage.priority,requiresHuman:triage.requiresHuman};
}

async function listThreads(request,env,ctx){
  const result=await env.DB.prepare(`SELECT id,title,status,target_service,created_at,updated_at,(SELECT body FROM messenger_messages m WHERE m.thread_id=messenger_threads.id ORDER BY m.id DESC LIMIT 1) AS last_message,(SELECT COUNT(*) FROM messenger_messages m WHERE m.thread_id=messenger_threads.id) AS message_count,(SELECT COUNT(*) FROM messenger_outbox o WHERE o.thread_id=messenger_threads.id AND o.status IN ('pending','processing','failed')) AS pending_events FROM messenger_threads WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 60`).bind(ctx.subject.type,ctx.subject.key).all();
  await auditPrincipal(env,ctx.principal,'conversation:read');return json(request,env,{subject:ctx.subject,threads:result.results||[]});
}
async function createThread(request,env,ctx,executionCtx){
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);const title=clean(data.title,160),message=clean(data.message),targetService=clean(data.targetService,80);if(!title)return json(request,env,{error:'TITLE_REQUIRED'},400);
  const now=nowIso();const inserted=await env.DB.prepare(`INSERT INTO messenger_threads(subject_type,subject_key,owner_user_id,title,status,target_service,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(ctx.subject.type,ctx.subject.key,ctx.identity.id,title,'open',targetService,ctx.identity.email,now,now).run();
  const threadId=Number(inserted.meta?.last_row_id||0);if(!threadId)return json(request,env,{error:'THREAD_INSERT_FAILED'},500);let assistant=null;
  if(message){const result=await env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(threadId,ctx.principal.id,'human',message,safeJson({principalId:ctx.principal.id,provider:ctx.principal.provider}),now).run();const messageId=Number(result.meta?.last_row_id||0);const triage=classifyMessengerMessage(message);await recordEvent(env,threadId,'message.created','human',ctx.principal.id,{channel:'web',messageId,triage});if(triage.requiresHuman)await ensureAutomaticHandoff(env,threadId,ctx.principal,triage);assistant=await queueAssistant(env,executionCtx,{threadId,messageId,message,triage})}
  await auditPrincipal(env,ctx.principal,'conversation:write');return json(request,env,{ok:true,threadId,assistant},201);
}
async function readThread(request,env,ctx,id){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);const [messages,handoffs,channels,outbox]=await Promise.all([env.DB.prepare(`SELECT id,author_user_id,author_kind,body,metadata_json,created_at FROM messenger_messages WHERE thread_id=? ORDER BY id ASC LIMIT 500`).bind(id).all(),env.DB.prepare(`SELECT id,target_role,status,assigned_to_user_id,note,created_at,updated_at FROM messenger_handoffs WHERE thread_id=? ORDER BY id DESC LIMIT 50`).bind(id).all(),env.DB.prepare(`SELECT channel,status,external_thread_id,updated_at FROM messenger_channel_links WHERE thread_id=? ORDER BY updated_at DESC`).bind(id).all(),env.DB.prepare(`SELECT id,consumer,status,attempts,last_error,created_at,updated_at FROM messenger_outbox WHERE thread_id=? ORDER BY id DESC LIMIT 30`).bind(id).all()]);
  await auditPrincipal(env,ctx.principal,'conversation:read');return json(request,env,{subject:ctx.subject,thread,messages:(messages.results||[]).map(row=>({...row,metadata:safeParse(row.metadata_json,{})})),handoffs:handoffs.results||[],channels:channels.results||[],processing:outbox.results||[]});
}
async function addMessage(request,env,ctx,id,executionCtx){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);if(['archived','resolved'].includes(thread.status))return json(request,env,{error:'THREAD_CLOSED'},409);const data=await body(request);const message=clean(data?.body);if(!message)return json(request,env,{error:'MESSAGE_REQUIRED'},400);
  const now=nowIso();const result=await env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(id,ctx.principal.id,'human',message,safeJson({...data?.metadata,principalId:ctx.principal.id,provider:ctx.principal.provider}),now).run();const messageId=Number(result.meta?.last_row_id||0);await env.DB.prepare(`UPDATE messenger_threads SET updated_at=? WHERE id=?`).bind(now,id).run();const triage=classifyMessengerMessage(message);await recordEvent(env,id,'message.created','human',ctx.principal.id,{channel:'web',messageId,triage});if(triage.requiresHuman)await ensureAutomaticHandoff(env,id,ctx.principal,triage);const assistant=await queueAssistant(env,executionCtx,{threadId:id,messageId,message,triage});await auditPrincipal(env,ctx.principal,'conversation:write');return json(request,env,{ok:true,threadId:id,messageId,assistant},201);
}
async function updateThread(request,env,ctx,id){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);const status=THREAD_STATES.has(String(data.status||''))?String(data.status):thread.status;const title=clean(data.title||thread.title,160);const targetService=clean(data.targetService??thread.target_service,80);await env.DB.prepare(`UPDATE messenger_threads SET title=?,status=?,target_service=?,updated_at=? WHERE id=?`).bind(title,status,targetService,nowIso(),id).run();await recordEvent(env,id,'thread.updated','human',ctx.principal.id,{status,title,targetService});return json(request,env,{ok:true,status,title,targetService});
}
async function requestHandoff(request,env,ctx,id){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);const data=await body(request)||{};const existing=await activeHandoff(env,id);if(existing)return json(request,env,{error:'HANDOFF_ALREADY_OPEN',handoffId:existing.id},409);const now=nowIso();const role=clean(data.targetRole||'manager',80),note=clean(data.note,1000);const inserted=await env.DB.prepare(`INSERT INTO messenger_handoffs(thread_id,requested_by_user_id,target_role,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id,ctx.principal.id,role,'requested',note,now,now).run();const handoffId=Number(inserted.meta?.last_row_id||0);await env.DB.prepare(`UPDATE messenger_threads SET status='waiting_human',updated_at=? WHERE id=?`).bind(now,id).run();await recordEvent(env,id,'human.review_requested','human',ctx.principal.id,{handoffId,manual:true,targetRole:role});return json(request,env,{ok:true,handoffId,status:'requested'},201);
}

export async function handleWorkspaceMessengerV2(request,env,executionCtx){
  const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';if(!path.startsWith('/v1/messenger/'))return null;const {allowed,headers}=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});if(!allowed)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);if(!env.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  const write=!['GET','HEAD'].includes(request.method);const ctx=await resolveWorkspacePrincipal(request,env,{write});if(ctx.error)return json(request,env,{error:ctx.error},ctx.status);
  if(request.method==='GET'&&path==='/v1/messenger/threads')return listThreads(request,env,ctx);if(request.method==='POST'&&path==='/v1/messenger/threads')return createThread(request,env,ctx,executionCtx);
  let match=path.match(/^\/v1\/messenger\/threads\/(\d+)$/);if(match){const id=toId(match[1]);if(request.method==='GET')return readThread(request,env,ctx,id);if(request.method==='PUT')return updateThread(request,env,ctx,id)}
  match=path.match(/^\/v1\/messenger\/threads\/(\d+)\/messages$/);if(match&&request.method==='POST')return addMessage(request,env,ctx,toId(match[1]),executionCtx);
  match=path.match(/^\/v1\/messenger\/threads\/(\d+)\/handoff$/);if(match&&request.method==='POST')return requestHandoff(request,env,ctx,toId(match[1]));return json(request,env,{error:'NOT_FOUND'},404);
}
