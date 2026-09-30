import { runAiEnhancedTask } from './ai-resilience-runtime.js';
import { d1SchemaReady } from './d1-schema-readiness.js';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const WRITE_ROLES=new Set(['store_owner','hq_manager','client_admin','client_editor','manager','owner']);
const SUBJECT_TYPES=new Set(['person','tenant']);
const INVEST_STAGES=new Set(['inbox','screening','diligence','memo','watch','declined','connected']);
const DILIGENCE_STATES=new Set(['open','verified','concern','not_applicable']);
const THREAD_STATES=new Set(['open','waiting_human','resolved','archived']);
const HUMAN_PATTERNS=[/관리자|담당자|사람(?:이|과|에게)?\s*(?:답|연결|상담)|직접\s*(?:답|상담|통화)/i,/human|agent|operator|representative/i];
const HIGH_RISK_PATTERNS=[/결제|환불|계약|해지|개인정보|비밀번호|계정\s*(?:삭제|탈취)|회원\s*삭제|법적|분쟁|신고|보안/i,/payment|refund|contract|privacy|password|delete\s+account|legal|security/i];
const FAILURE_PATTERNS=[/오류|장애|실패|안\s*돼|안\s*되|접속\s*(?:불가|안)|로그인\s*(?:불가|안)|발행\s*실패/i,/error|failed|failure|down|unavailable|can't\s+login/i];
const nowIso=()=>new Date().toISOString();
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const toId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0};
function safeJson(value,fallback={}){try{return JSON.stringify(value??fallback)}catch{return JSON.stringify(fallback)}}
function safeParse(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
function safeUrl(value){const raw=clean(value,2048);if(!raw)return '';try{const url=new URL(raw);return url.protocol==='https:'?url.href:''}catch{return ''}}

export function classifyMessengerMessage(value=''){
  const text=clean(value,8000);let score=0;const reasons=[];
  if(HUMAN_PATTERNS.some(pattern=>pattern.test(text))){score+=4;reasons.push('explicit_human_request')}
  if(HIGH_RISK_PATTERNS.some(pattern=>pattern.test(text))){score+=3;reasons.push('sensitive_or_high_risk')}
  if(FAILURE_PATTERNS.some(pattern=>pattern.test(text))){score+=2;reasons.push('service_failure')}
  return {score,priority:score>=5?'urgent':score>=2?'review':'normal',requiresHuman:score>=3,reasons};
}

function cors(request,env){
  const origin=String(request.headers.get('origin')||'');
  const allowedOrigins=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  const allowed=!origin||allowedOrigins.includes(origin);
  const headers={
    'access-control-allow-headers':'content-type, authorization, idempotency-key',
    'access-control-allow-methods':'GET, POST, PUT, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if(origin&&allowed)headers['access-control-allow-origin']=origin;
  return {allowed,headers};
}
function json(request,env,data,status=200,extra={}){
  const {headers}=cors(request,env);
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers,...extra}});
}
async function body(request){try{return await request.json()}catch{return null}}
async function identityFromRequest(request){
  const auth=String(request.headers.get('authorization')||'');
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token||token.length>8192)return null;
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  if(!response?.ok)return null;
  const user=await response.json().catch(()=>null);
  const email=String(user?.email||'').trim().toLowerCase();
  if(!user?.id||!email||!user?.email_confirmed_at)return null;
  return {id:String(user.id),email};
}
async function resolveSubject(env,identity,type,key){
  const subjectType=SUBJECT_TYPES.has(String(type||'').toLowerCase())?String(type).toLowerCase():'person';
  if(subjectType==='person')return {type:'person',key:identity.id,role:'owner',writable:true};
  const tenantKey=clean(key,80).toLowerCase();
  if(!tenantKey)return null;
  const tenant=await env.DB.prepare('SELECT id,slug,status FROM customer_tenants WHERE slug=?').bind(tenantKey).first();
  if(!tenant||tenant.status!=='active')return null;
  const grant=await env.DB.prepare('SELECT role,enabled FROM customer_access_grants WHERE tenant_id=? AND email=?').bind(tenant.id,identity.email).first();
  if(!grant||Number(grant.enabled)!==1)return null;
  const role=String(grant.role||'');
  return {type:'tenant',key:String(tenant.slug),role,writable:WRITE_ROLES.has(role)};
}
async function authContext(request,env,{write=false}={}){
  const identity=await identityFromRequest(request);
  if(!identity)return {error:'AUTH_REQUIRED',status:401};
  const url=new URL(request.url);
  const subject=await resolveSubject(env,identity,url.searchParams.get('subject_type'),url.searchParams.get('subject_key'));
  if(!subject)return {error:'SUBJECT_FORBIDDEN',status:403};
  if(write&&!subject.writable)return {error:'SUBJECT_READ_ONLY',status:403};
  if(write&&String(env.ALLOW_MUTATIONS)!=='true')return {error:'MUTATIONS_DISABLED',status:503};
  return {identity,subject};
}
async function schemaReady(env){
  return d1SchemaReady(env?.DB,['messenger_threads','messenger_messages','messenger_handoffs','messenger_events','messenger_channel_links','investment_opportunities','investment_diligence_items']);
}

async function recordMessengerEvent(env,threadId,eventType,actorKind='system',actorId='',detail={}){
  try{
    await env.DB.prepare(`INSERT INTO messenger_events(thread_id,event_type,actor_kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)`)
      .bind(threadId,eventType,actorKind,clean(actorId,240),safeJson(detail),nowIso()).run();
  }catch{}
}
async function activeHandoff(env,threadId){
  return await env.DB.prepare(`SELECT id,status,assigned_to_user_id FROM messenger_handoffs WHERE thread_id=? AND status IN ('requested','accepted') ORDER BY id DESC LIMIT 1`).bind(threadId).first();
}
async function ensureAutomaticHandoff(env,threadId,identity,triage){
  const existing=await activeHandoff(env,threadId);if(existing)return existing;
  const now=nowIso();
  const inserted=await env.DB.prepare(`INSERT INTO messenger_handoffs(thread_id,requested_by_user_id,target_role,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(threadId,identity.id,'manager','requested',`AI 자동 분류: ${triage.reasons.join(', ')||'human_review'}`,now,now).run();
  const handoffId=Number(inserted.meta?.last_row_id||0);
  await env.DB.prepare(`UPDATE messenger_threads SET status='waiting_human',updated_at=? WHERE id=?`).bind(now,threadId).run();
  await recordMessengerEvent(env,threadId,'human.review_requested','agent','ekodi-assistant',{handoffId,priority:triage.priority,reasons:triage.reasons});
  return {id:handoffId,status:'requested',assigned_to_user_id:null};
}
function messengerProviders(env,context){
  const providers=[];
  if(env.MESSENGER_AI&&typeof env.MESSENGER_AI.fetch==='function')providers.push({id:'messenger_ai_binding',invoke:async()=>{
    const response=await env.MESSENGER_AI.fetch('https://ekodi.internal/messenger/respond',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(context)});
    if(!response.ok)throw new Error('MESSENGER_AI_BINDING_FAILED');const data=await response.json();const reply=clean(data?.reply||data?.message,8000);if(!reply)throw new Error('MESSENGER_AI_EMPTY_REPLY');return {reply};
  }});
  const endpoint=safeUrl(env.MESSENGER_AI_URL||'');
  if(endpoint)providers.push({id:'messenger_ai_http',invoke:async()=>{
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(env.MESSENGER_AI_TOKEN?{authorization:`Bearer ${env.MESSENGER_AI_TOKEN}`}:{})},body:JSON.stringify(context),signal:AbortSignal.timeout(4500)});
    if(!response.ok)throw new Error('MESSENGER_AI_HTTP_FAILED');const data=await response.json();const reply=clean(data?.reply||data?.message,8000);if(!reply)throw new Error('MESSENGER_AI_EMPTY_REPLY');return {reply};
  }});
  return providers;
}
function freeAssistReply(triage){
  return triage.requiresHuman
    ?'요청을 확인했습니다. 중요한 내용으로 분류해 관리자 확인 대기열에 올렸습니다. 담당자가 참여하기 전까지 대화 맥락은 그대로 보존됩니다.'
    :'요청을 접수했습니다. 현재 고급 AI 응답 연결이 없거나 일시적으로 사용할 수 없어 기본 지원 모드로 기록했습니다. 사람의 확인이 필요하면 바로 연결을 요청할 수 있습니다.';
}
async function autoAssist(env,thread,ctx,message){
  const handoff=await activeHandoff(env,thread.id);
  if(handoff?.status==='accepted')return {suppressed:true,reason:'human_operator_active',handoffId:handoff.id};
  const triage=classifyMessengerMessage(message);
  if(triage.requiresHuman)await ensureAutomaticHandoff(env,thread.id,ctx.identity,triage);
  const context={threadId:thread.id,subject:ctx.subject,targetService:thread.target_service||'',message,triage};
  const result=await runAiEnhancedTask({env,providers:messengerProviders(env,context),taskName:'messenger_reply',timeoutMs:4000,fallback:async()=>({reply:freeAssistReply(triage)})});
  const reply=clean(result.value?.reply||freeAssistReply(triage),8000);const now=nowIso();const authorKind=result.mode==='ai'?'ai':'agent';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(thread.id,'ekodi-assistant',authorKind,reply,safeJson({mode:result.mode,degraded:Boolean(result.degraded),provider:result.provider||null,priority:triage.priority,triage}),now),
    env.DB.prepare(`UPDATE messenger_threads SET updated_at=? WHERE id=?`).bind(now,thread.id),
  ]);
  await recordMessengerEvent(env,thread.id,'assistant.reply',authorKind,'ekodi-assistant',{mode:result.mode,degraded:Boolean(result.degraded),priority:triage.priority,requiresHuman:triage.requiresHuman});
  return {suppressed:false,mode:result.mode,degraded:Boolean(result.degraded),priority:triage.priority,requiresHuman:triage.requiresHuman};
}

async function listThreads(request,env,subject){
  const result=await env.DB.prepare(`SELECT id,title,status,target_service,created_at,updated_at,
    (SELECT body FROM messenger_messages m WHERE m.thread_id=messenger_threads.id ORDER BY m.id DESC LIMIT 1) AS last_message,
    (SELECT COUNT(*) FROM messenger_messages m WHERE m.thread_id=messenger_threads.id) AS message_count
    FROM messenger_threads WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 60`).bind(subject.type,subject.key).all();
  return json(request,env,{subject,threads:result.results||[]});
}
async function createThread(request,env,ctx){
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const title=clean(data.title,160),message=clean(data.message,8000),targetService=clean(data.targetService,80);
  if(!title)return json(request,env,{error:'TITLE_REQUIRED'},400);
  const now=nowIso();
  const inserted=await env.DB.prepare(`INSERT INTO messenger_threads(subject_type,subject_key,owner_user_id,title,status,target_service,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(ctx.subject.type,ctx.subject.key,ctx.identity.id,title,'open',targetService,ctx.identity.email,now,now).run();
  const threadId=Number(inserted.meta?.last_row_id||0);if(!threadId)return json(request,env,{error:'THREAD_INSERT_FAILED'},500);
  let assistant=null;
  if(message){
    await env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(threadId,ctx.identity.id,'human',message,'{}',now).run();
    await recordMessengerEvent(env,threadId,'message.created','human',ctx.identity.id,{channel:'web'});
    assistant=await autoAssist(env,{id:threadId,target_service:targetService},ctx,message);
  }
  return json(request,env,{ok:true,threadId,assistant},201);
}
async function threadForSubject(env,id,subject){
  return await env.DB.prepare(`SELECT id,title,status,target_service,owner_user_id,created_at,updated_at FROM messenger_threads WHERE id=? AND subject_type=? AND subject_key=?`).bind(id,subject.type,subject.key).first();
}
async function readThread(request,env,subject,id){
  const thread=await threadForSubject(env,id,subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);
  const [messages,handoffs,channels]=await Promise.all([
    env.DB.prepare(`SELECT id,author_user_id,author_kind,body,metadata_json,created_at FROM messenger_messages WHERE thread_id=? ORDER BY id ASC LIMIT 500`).bind(id).all(),
    env.DB.prepare(`SELECT id,target_role,status,assigned_to_user_id,note,created_at,updated_at FROM messenger_handoffs WHERE thread_id=? ORDER BY id DESC LIMIT 50`).bind(id).all(),
    env.DB.prepare(`SELECT channel,status,external_thread_id,updated_at FROM messenger_channel_links WHERE thread_id=? ORDER BY updated_at DESC`).bind(id).all(),
  ]);
  return json(request,env,{subject,thread,messages:(messages.results||[]).map(row=>({...row,metadata:safeParse(row.metadata_json,{})})),handoffs:handoffs.results||[],channels:channels.results||[]});
}
async function addMessage(request,env,ctx,id){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);
  if(thread.status==='archived')return json(request,env,{error:'THREAD_ARCHIVED'},409);
  const data=await body(request);const message=clean(data?.body,8000);if(!message)return json(request,env,{error:'MESSAGE_REQUIRED'},400);
  const now=nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`).bind(id,ctx.identity.id,'human',message,safeJson(data?.metadata||{}),now),
    env.DB.prepare(`UPDATE messenger_threads SET updated_at=? WHERE id=?`).bind(now,id),
  ]);
  await recordMessengerEvent(env,id,'message.created','human',ctx.identity.id,{channel:'web'});
  const assistant=await autoAssist(env,thread,ctx,message);
  return json(request,env,{ok:true,threadId:id,assistant},201);
}
async function updateThread(request,env,ctx,id){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const status=THREAD_STATES.has(String(data.status||''))?String(data.status):thread.status;
  const title=clean(data.title||thread.title,160);const targetService=clean(data.targetService??thread.target_service,80);
  await env.DB.prepare(`UPDATE messenger_threads SET title=?,status=?,target_service=?,updated_at=? WHERE id=?`).bind(title,status,targetService,nowIso(),id).run();
  return json(request,env,{ok:true,status,title,targetService});
}
async function requestHandoff(request,env,ctx,id){
  const thread=await threadForSubject(env,id,ctx.subject);if(!thread)return json(request,env,{error:'NOT_FOUND'},404);
  const data=await body(request)||{};const role=clean(data.targetRole||'manager',80),note=clean(data.note,1000),now=nowIso();
  const existing=await activeHandoff(env,id);
  if(existing)return json(request,env,{error:'HANDOFF_ALREADY_OPEN',handoffId:existing.id},409);
  const inserted=await env.DB.prepare(`INSERT INTO messenger_handoffs(thread_id,requested_by_user_id,target_role,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id,ctx.identity.id,role,'requested',note,now,now).run();
  const handoffId=Number(inserted.meta?.last_row_id||0);
  await env.DB.prepare(`UPDATE messenger_threads SET status='waiting_human',updated_at=? WHERE id=?`).bind(now,id).run();
  await recordMessengerEvent(env,id,'human.review_requested','human',ctx.identity.id,{handoffId,manual:true,targetRole:role});
  return json(request,env,{ok:true,handoffId,status:'requested'},201);
}

async function listOpportunities(request,env,subject){
  const result=await env.DB.prepare(`SELECT id,name,stage,summary,source_url,thesis,risk_summary,memo_json,created_at,updated_at,
    (SELECT COUNT(*) FROM investment_diligence_items d WHERE d.opportunity_id=investment_opportunities.id AND d.status='open') AS open_diligence,
    (SELECT COUNT(*) FROM investment_diligence_items d WHERE d.opportunity_id=investment_opportunities.id AND d.status='concern') AS concerns
    FROM investment_opportunities WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 100`).bind(subject.type,subject.key).all();
  return json(request,env,{subject,transactionMode:'analysis-and-connection-only',opportunities:(result.results||[]).map(row=>({...row,memo:safeParse(row.memo_json,{})}))});
}
async function createOpportunity(request,env,ctx){
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const name=clean(data.name,180);if(!name)return json(request,env,{error:'NAME_REQUIRED'},400);
  const stage=INVEST_STAGES.has(String(data.stage||''))?String(data.stage):'inbox';const sourceUrl=safeUrl(data.sourceUrl);
  if(data.sourceUrl&&!sourceUrl)return json(request,env,{error:'HTTPS_SOURCE_URL_REQUIRED'},400);
  const now=nowIso();
  const inserted=await env.DB.prepare(`INSERT INTO investment_opportunities(subject_type,subject_key,owner_user_id,name,stage,summary,source_url,thesis,risk_summary,memo_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(ctx.subject.type,ctx.subject.key,ctx.identity.id,name,stage,clean(data.summary,4000),sourceUrl,clean(data.thesis,6000),clean(data.riskSummary,6000),safeJson(data.memo||{}),ctx.identity.email,now,now).run();
  return json(request,env,{ok:true,opportunityId:Number(inserted.meta?.last_row_id||0),transactionMode:'analysis-and-connection-only'},201);
}
async function opportunityForSubject(env,id,subject){return await env.DB.prepare(`SELECT * FROM investment_opportunities WHERE id=? AND subject_type=? AND subject_key=?`).bind(id,subject.type,subject.key).first()}
async function readOpportunity(request,env,subject,id){
  const opportunity=await opportunityForSubject(env,id,subject);if(!opportunity)return json(request,env,{error:'NOT_FOUND'},404);
  const items=await env.DB.prepare(`SELECT id,category,question,status,evidence_url,note,created_by,created_at,updated_at FROM investment_diligence_items WHERE opportunity_id=? ORDER BY id ASC`).bind(id).all();
  return json(request,env,{subject,transactionMode:'analysis-and-connection-only',opportunity:{...opportunity,memo:safeParse(opportunity.memo_json,{})},diligence:items.results||[]});
}
async function updateOpportunity(request,env,ctx,id){
  const current=await opportunityForSubject(env,id,ctx.subject);if(!current)return json(request,env,{error:'NOT_FOUND'},404);
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const stage=INVEST_STAGES.has(String(data.stage||''))?String(data.stage):current.stage;
  const sourceUrl=data.sourceUrl===undefined?current.source_url:safeUrl(data.sourceUrl);
  if(data.sourceUrl&&!sourceUrl)return json(request,env,{error:'HTTPS_SOURCE_URL_REQUIRED'},400);
  await env.DB.prepare(`UPDATE investment_opportunities SET name=?,stage=?,summary=?,source_url=?,thesis=?,risk_summary=?,memo_json=?,updated_at=? WHERE id=?`).bind(
    clean(data.name||current.name,180),stage,clean(data.summary??current.summary,4000),sourceUrl,clean(data.thesis??current.thesis,6000),clean(data.riskSummary??current.risk_summary,6000),safeJson(data.memo??safeParse(current.memo_json,{})),nowIso(),id).run();
  return json(request,env,{ok:true,stage,transactionMode:'analysis-and-connection-only'});
}
async function addDiligence(request,env,ctx,id){
  const opportunity=await opportunityForSubject(env,id,ctx.subject);if(!opportunity)return json(request,env,{error:'NOT_FOUND'},404);
  const data=await body(request);const question=clean(data?.question,1000);if(!question)return json(request,env,{error:'QUESTION_REQUIRED'},400);
  const status=DILIGENCE_STATES.has(String(data.status||''))?String(data.status):'open';const evidenceUrl=safeUrl(data.evidenceUrl);
  if(data.evidenceUrl&&!evidenceUrl)return json(request,env,{error:'HTTPS_EVIDENCE_URL_REQUIRED'},400);
  const now=nowIso();
  const inserted=await env.DB.prepare(`INSERT INTO investment_diligence_items(opportunity_id,category,question,status,evidence_url,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id,clean(data.category||'general',80),question,status,evidenceUrl,clean(data.note,3000),ctx.identity.email,now,now).run();
  await env.DB.prepare(`UPDATE investment_opportunities SET stage=CASE WHEN stage IN ('inbox','screening') THEN 'diligence' ELSE stage END,updated_at=? WHERE id=?`).bind(now,id).run();
  return json(request,env,{ok:true,itemId:Number(inserted.meta?.last_row_id||0)},201);
}
async function updateDiligence(request,env,ctx,id,itemId){
  const opportunity=await opportunityForSubject(env,id,ctx.subject);if(!opportunity)return json(request,env,{error:'NOT_FOUND'},404);
  const current=await env.DB.prepare(`SELECT * FROM investment_diligence_items WHERE id=? AND opportunity_id=?`).bind(itemId,id).first();if(!current)return json(request,env,{error:'DILIGENCE_NOT_FOUND'},404);
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const status=DILIGENCE_STATES.has(String(data.status||''))?String(data.status):current.status;const evidenceUrl=data.evidenceUrl===undefined?current.evidence_url:safeUrl(data.evidenceUrl);
  if(data.evidenceUrl&&!evidenceUrl)return json(request,env,{error:'HTTPS_EVIDENCE_URL_REQUIRED'},400);
  await env.DB.prepare(`UPDATE investment_diligence_items SET category=?,question=?,status=?,evidence_url=?,note=?,updated_at=? WHERE id=?`).bind(clean(data.category||current.category,80),clean(data.question||current.question,1000),status,evidenceUrl,clean(data.note??current.note,3000),nowIso(),itemId).run();
  return json(request,env,{ok:true,status});
}

export default {async fetch(request,env){
  const {allowed,headers}=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
  if(!allowed)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  const url=new URL(request.url);const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path==='/health')return json(request,env,{service:'ekodi-workspace-platform-api',environment:env.ENVIRONMENT||'unknown',schemaReady:await schemaReady(env),mutations:String(env.ALLOW_MUTATIONS)==='true',aiProviderConfigured:Boolean(env.MESSENGER_AI||safeUrl(env.MESSENGER_AI_URL||'')),transactionExecution:false});
  if(!env.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  const write=!['GET','HEAD'].includes(request.method);const ctx=await authContext(request,env,{write});if(ctx.error)return json(request,env,{error:ctx.error},ctx.status);
  if(request.method==='GET'&&path==='/v1/messenger/threads')return listThreads(request,env,ctx.subject);
  if(request.method==='POST'&&path==='/v1/messenger/threads')return createThread(request,env,ctx);
  let match=path.match(/^\/v1\/messenger\/threads\/(\d+)$/);if(match){const id=toId(match[1]);if(request.method==='GET')return readThread(request,env,ctx.subject,id);if(request.method==='PUT')return updateThread(request,env,ctx,id)}
  match=path.match(/^\/v1\/messenger\/threads\/(\d+)\/messages$/);if(match&&request.method==='POST')return addMessage(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/messenger\/threads\/(\d+)\/handoff$/);if(match&&request.method==='POST')return requestHandoff(request,env,ctx,toId(match[1]));
  if(request.method==='GET'&&path==='/v1/invest/opportunities')return listOpportunities(request,env,ctx.subject);
  if(request.method==='POST'&&path==='/v1/invest/opportunities')return createOpportunity(request,env,ctx);
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)$/);if(match){const id=toId(match[1]);if(request.method==='GET')return readOpportunity(request,env,ctx.subject,id);if(request.method==='PUT')return updateOpportunity(request,env,ctx,id)}
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/diligence$/);if(match&&request.method==='POST')return addDiligence(request,env,ctx,toId(match[1]));
  match=path.match(/^\/v1\/invest\/opportunities\/(\d+)\/diligence\/(\d+)$/);if(match&&request.method==='PUT')return updateDiligence(request,env,ctx,toId(match[1]),toId(match[2]));
  return json(request,env,{error:'NOT_FOUND'},404);
}};
