import authWorker from './auth-worker.js';

const PREFIX='/api/control/messenger';
const CHANNELS=new Set(['kakao','whatsapp','telegram','email','sms']);
const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
function safeJson(value,fallback={}){try{return JSON.stringify(value??fallback)}catch{return JSON.stringify(fallback)}}
function safeParse(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}

function json(data,status=200,request=null,env={}){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  const origin=request?.headers?.get('origin')||'';
  const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(origin&&allowed.includes(origin)){headers.set('access-control-allow-origin',origin);headers.set('vary','Origin')}
  return new Response(JSON.stringify(data),{status,headers});
}
async function sessionCheck(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return {response};
  return {response,session:await response.clone().json()};
}
async function readJson(request){try{return await request.json()}catch{return null}}
async function recordEvent(env,threadId,eventType,actorKind,actorId,detail={}){
  await env.DB.prepare(`INSERT INTO messenger_events(thread_id,event_type,actor_kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(threadId,eventType,actorKind,clean(actorId,240),safeJson(detail),nowIso()).run();
}
async function threadExists(env,id){return await env.DB.prepare('SELECT id,title,status,target_service,subject_type,subject_key,owner_user_id,created_by,created_at,updated_at FROM messenger_threads WHERE id=?').bind(id).first()}
async function activeHandoff(env,id){return await env.DB.prepare(`SELECT id,status,target_role,assigned_to_user_id,note,created_at,updated_at FROM messenger_handoffs WHERE thread_id=? AND status IN ('requested','accepted') ORDER BY id DESC LIMIT 1`).bind(id).first()}

async function listInbox(request,env){
  const url=new URL(request.url);const all=url.searchParams.get('all')==='1';
  const where=all?'':`WHERE t.status='waiting_human' OR EXISTS(SELECT 1 FROM messenger_handoffs h WHERE h.thread_id=t.id AND h.status IN ('requested','accepted'))`;
  const rows=await env.DB.prepare(`SELECT t.id,t.subject_type,t.subject_key,t.title,t.status,t.target_service,t.created_by,t.updated_at,
    (SELECT h.status FROM messenger_handoffs h WHERE h.thread_id=t.id AND h.status IN ('requested','accepted') ORDER BY h.id DESC LIMIT 1) AS handoff_status,
    (SELECT h.assigned_to_user_id FROM messenger_handoffs h WHERE h.thread_id=t.id AND h.status IN ('requested','accepted') ORDER BY h.id DESC LIMIT 1) AS assigned_to,
    (SELECT m.body FROM messenger_messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
    (SELECT m.metadata_json FROM messenger_messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_metadata
    FROM messenger_threads t ${where}
    ORDER BY CASE WHEN t.status='waiting_human' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 120`).all();
  const inbox=(rows.results||[]).map(row=>{const metadata=safeParse(row.last_metadata,{});return {id:row.id,subjectType:row.subject_type,subjectKey:row.subject_key,title:row.title,status:row.status,targetService:row.target_service,createdBy:row.created_by,updatedAt:row.updated_at,handoffStatus:row.handoff_status||null,assignedTo:row.assigned_to||null,lastMessage:row.last_message||'',priority:metadata.priority||metadata.triage?.priority||'normal'}});
  return json({ok:true,inbox,filtered:!all},200,request,env);
}
async function readThread(request,env,id){
  const thread=await threadExists(env,id);if(!thread)return json({error:'THREAD_NOT_FOUND'},404,request,env);
  const [messages,handoffs,events,channels]=await Promise.all([
    env.DB.prepare(`SELECT id,author_user_id,author_kind,body,metadata_json,created_at FROM messenger_messages WHERE thread_id=? ORDER BY id ASC LIMIT 600`).bind(id).all(),
    env.DB.prepare(`SELECT id,requested_by_user_id,target_role,status,assigned_to_user_id,note,created_at,updated_at FROM messenger_handoffs WHERE thread_id=? ORDER BY id DESC LIMIT 100`).bind(id).all(),
    env.DB.prepare(`SELECT id,event_type,actor_kind,actor_id,detail_json,created_at FROM messenger_events WHERE thread_id=? ORDER BY id DESC LIMIT 150`).bind(id).all(),
    env.DB.prepare(`SELECT channel,external_thread_id,status,metadata_json,created_at,updated_at FROM messenger_channel_links WHERE thread_id=? ORDER BY updated_at DESC`).bind(id).all(),
  ]);
  return json({ok:true,thread,messages:(messages.results||[]).map(row=>({...row,metadata:safeParse(row.metadata_json,{})})),handoffs:handoffs.results||[],events:(events.results||[]).map(row=>({...row,detail:safeParse(row.detail_json,{})})),channels:(channels.results||[]).map(row=>({...row,metadata:safeParse(row.metadata_json,{})}))},200,request,env);
}
async function takeover(request,env,session,id){
  const thread=await threadExists(env,id);if(!thread)return json({error:'THREAD_NOT_FOUND'},404,request,env);
  if(['resolved','archived'].includes(thread.status))return json({error:'THREAD_CLOSED'},409,request,env);
  const operator=clean(session.email||'admin',240);const now=nowIso();let handoff=await activeHandoff(env,id);
  if(handoff?.status==='accepted'&&handoff.assigned_to_user_id&&handoff.assigned_to_user_id!==operator)return json({error:'HANDOFF_ALREADY_ACCEPTED',assignedTo:handoff.assigned_to_user_id},409,request,env);
  if(handoff){
    await env.DB.prepare(`UPDATE messenger_handoffs SET status='accepted',assigned_to_user_id=?,updated_at=? WHERE id=?`).bind(operator,now,handoff.id).run();
  }else{
    const inserted=await env.DB.prepare(`INSERT INTO messenger_handoffs(thread_id,requested_by_user_id,target_role,status,assigned_to_user_id,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,'system','manager','accepted',operator,'관리자 직접 인수',now,now).run();
    handoff={id:Number(inserted.meta?.last_row_id||0)};
  }
  await env.DB.prepare(`UPDATE messenger_threads SET status='waiting_human',updated_at=? WHERE id=?`).bind(now,id).run();
  await recordEvent(env,id,'human.takeover','admin',operator,{handoffId:handoff.id});
  return json({ok:true,threadId:id,handoffId:handoff.id,status:'accepted',assignedTo:operator},200,request,env);
}
async function reply(request,env,session,id){
  const thread=await threadExists(env,id);if(!thread)return json({error:'THREAD_NOT_FOUND'},404,request,env);
  if(['resolved','archived'].includes(thread.status))return json({error:'THREAD_CLOSED'},409,request,env);
  const data=await readJson(request);const message=clean(data?.message,8000);if(!message)return json({error:'MESSAGE_REQUIRED'},400,request,env);
  const operator=clean(session.email||'admin',240);let handoff=await activeHandoff(env,id);
  if(!handoff||handoff.status!=='accepted'||handoff.assigned_to_user_id!==operator){
    const takeoverResponse=await takeover(request,env,session,id);if(!takeoverResponse.ok)return takeoverResponse;
    handoff=await activeHandoff(env,id);
  }
  const now=nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(id,`admin:${operator}`,'human',message,safeJson({admin:true,operator,channel:clean(data?.channel||'web',40)}),now),
    env.DB.prepare(`UPDATE messenger_threads SET updated_at=? WHERE id=?`).bind(now,id),
  ]);
  await recordEvent(env,id,'admin.reply','admin',operator,{handoffId:handoff?.id||null,channel:clean(data?.channel||'web',40)});
  return json({ok:true,threadId:id,status:'human_active',assignedTo:operator},201,request,env);
}
async function release(request,env,session,id){
  const thread=await threadExists(env,id);if(!thread)return json({error:'THREAD_NOT_FOUND'},404,request,env);
  const operator=clean(session.email||'admin',240);const now=nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE messenger_handoffs SET status='closed',updated_at=? WHERE thread_id=? AND status IN ('requested','accepted')`).bind(now,id),
    env.DB.prepare(`UPDATE messenger_threads SET status='open',updated_at=? WHERE id=? AND status!='archived'`).bind(now,id),
  ]);
  await recordEvent(env,id,'human.release_to_ai','admin',operator,{});
  return json({ok:true,threadId:id,status:'open'},200,request,env);
}
async function closeThread(request,env,session,id){
  const thread=await threadExists(env,id);if(!thread)return json({error:'THREAD_NOT_FOUND'},404,request,env);
  const operator=clean(session.email||'admin',240);const now=nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE messenger_handoffs SET status='closed',updated_at=? WHERE thread_id=? AND status IN ('requested','accepted')`).bind(now,id),
    env.DB.prepare(`UPDATE messenger_threads SET status='resolved',updated_at=? WHERE id=?`).bind(now,id),
  ]);
  await recordEvent(env,id,'thread.resolved','admin',operator,{});
  return json({ok:true,threadId:id,status:'resolved'},200,request,env);
}
async function channelLink(request,env,session,id){
  const thread=await threadExists(env,id);if(!thread)return json({error:'THREAD_NOT_FOUND'},404,request,env);
  const data=await readJson(request);const channel=clean(data?.channel,40).toLowerCase();if(!CHANNELS.has(channel))return json({error:'CHANNEL_NOT_SUPPORTED'},400,request,env);
  const externalThreadId=clean(data?.externalThreadId,240);const now=nowIso();const operator=clean(session.email||'admin',240);
  await env.DB.prepare(`INSERT INTO messenger_channel_links(thread_id,channel,external_thread_id,status,metadata_json,created_at,updated_at) VALUES(?,?,?,'pending',?,?,?) ON CONFLICT(thread_id,channel) DO UPDATE SET external_thread_id=excluded.external_thread_id,status='pending',metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(id,channel,externalThreadId,safeJson(data?.metadata||{}),now,now).run();
  await recordEvent(env,id,'channel.link_requested','admin',operator,{channel,externalThreadId});
  return json({ok:true,threadId:id,channel,status:'pending',externalThreadId},202,request,env);
}

export async function handleMessengerOperatorControl(request,env){
  const url=new URL(request.url);const path=url.pathname;if(!path.startsWith(PREFIX))return null;
  if(request.method==='OPTIONS'){
    const headers=new Headers({'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'86400'});const origin=request.headers.get('origin');const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);if(origin&&allowed.includes(origin)){headers.set('access-control-allow-origin',origin);headers.set('vary','Origin')}return new Response(null,{status:204,headers});
  }
  const auth=await sessionCheck(request,env);if(!auth.session?.authenticated)return auth.response;
  if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503,request,env);
  if(request.method==='GET'&&path===`${PREFIX}/inbox`)return listInbox(request,env);
  let match=path.match(/^\/api\/control\/messenger\/threads\/(\d+)$/);if(match&&request.method==='GET')return readThread(request,env,Number(match[1]));
  match=path.match(/^\/api\/control\/messenger\/threads\/(\d+)\/(takeover|reply|release|close|channel-link)$/);
  if(match&&request.method==='POST'){
    const id=Number(match[1]),action=match[2];
    if(action==='takeover')return takeover(request,env,auth.session,id);
    if(action==='reply')return reply(request,env,auth.session,id);
    if(action==='release')return release(request,env,auth.session,id);
    if(action==='close')return closeThread(request,env,auth.session,id);
    if(action==='channel-link')return channelLink(request,env,auth.session,id);
  }
  return json({error:'NOT_FOUND'},404,request,env);
}
