import { resolveWorkspacePrincipal, auditPrincipal } from './ekodi-principal.js';
import { enqueueMessengerOutbox, drainMessengerOutbox } from './messenger-outbox.js';

const DEFAULT_STORES=Object.freeze(['jadam','pizzamaru','yogurt']);
const OPEN_STATES=Object.freeze(['awaiting_customer_confirmation','customer_confirmed','store_accepted']);
const clean=(value,max=8000)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const safeJson=value=>{try{return JSON.stringify(value??{})}catch{return '{}'}};
const toId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0};
const phoneLike=value=>/(?:\d[\s().-]?){7,}/.test(String(value||''));
export function isOpaqueSmsThreadId(value=''){const id=clean(value,240);return Boolean(id&&!phoneLike(id)&&!id.includes('@'))}
function safeCustomerDisplay(value=''){const display=clean(value,80);return !display||phoneLike(display)||display.includes('@')?'고객':display}

export function classifySmsOrderInput(value=''){
  const text=clean(value,500);
  if(/^(?:1|확정|주문확정|확인|네|예|yes|y)$/i.test(text))return 'confirm';
  if(/^(?:2|취소|주문취소|아니오|아니요|no|n)$/i.test(text))return 'cancel';
  return text?'order_text':'empty';
}

export function customerSmsOrderReply(kind,{orderText='',status=''}={}){
  if(kind==='draft')return `문자주문 내용을 확인해 주세요. "${clean(orderText,500)}" 주문이 맞으면 1, 취소는 2를 보내주세요.`;
  if(kind==='updated')return `주문 내용을 "${clean(orderText,500)}"로 바꿨습니다. 주문확정은 1, 취소는 2를 보내주세요.`;
  if(kind==='confirmed')return '주문확정을 접수했습니다. 매장에서 주문 가능 여부를 확인한 뒤 다시 안내드립니다.';
  if(kind==='cancelled')return '문자주문이 취소되었습니다. 새 주문 내용을 보내면 다시 접수할 수 있습니다.';
  if(kind==='pending')return status==='store_accepted'?'이미 매장에서 접수한 주문이 있습니다. 변경이나 취소가 필요하면 매장에 직접 연락해 주세요.':'현재 주문이 매장 확인 중입니다. 잠시 후 매장 확인 결과를 문자로 안내드립니다.';
  if(kind==='accepted')return `매장에서 주문을 접수했습니다. 주문 내용: "${clean(orderText,500)}". 최종 금액과 수령·배달 안내는 매장 확인 내용에 따릅니다.`;
  if(kind==='rejected')return '매장 확인 결과 현재 이 문자주문을 접수하기 어렵습니다. 필요하면 매장으로 직접 문의해 주세요.';
  if(kind==='completed')return '주문 처리가 완료되었습니다. 이용해 주셔서 감사합니다.';
  return '문자주문 요청을 확인했습니다.';
}

function allowedStores(env){
  const configured=clean(env?.STORE_SMS_ALLOWED_SLUGS,500).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  return new Set(configured.length?configured:DEFAULT_STORES);
}

async function secretMatches(request,env){
  const expected=clean(env?.STORE_SMS_INGRESS_TOKEN,1024);
  if(!expected)return null;
  const auth=clean(request.headers.get('authorization'),2048);
  const supplied=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!supplied||supplied.length!==expected.length)return false;
  const enc=new TextEncoder();
  const [a,b]=await Promise.all([
    crypto.subtle.digest('SHA-256',enc.encode(supplied)),
    crypto.subtle.digest('SHA-256',enc.encode(expected)),
  ]);
  const av=new Uint8Array(a),bv=new Uint8Array(b);let diff=0;
  for(let i=0;i<av.length;i++)diff|=av[i]^bv[i];
  return diff===0;
}

function cors(request,env){
  const origin=clean(request.headers.get('origin'),500);
  const allowedOrigins=clean(env?.ALLOWED_ORIGINS,2000).split(',').map(v=>v.trim()).filter(Boolean);
  const allowed=!origin||allowedOrigins.includes(origin);
  const headers={'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, OPTIONS','access-control-max-age':'86400',vary:'Origin'};
  if(origin&&allowed)headers['access-control-allow-origin']=origin;
  return {allowed,headers};
}
function json(request,env,data,status=200){
  const {headers}=cors(request,env);
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers}});
}
async function readJson(request){try{return await request.json()}catch{return null}}

async function recordEvent(env,threadId,eventType,actorKind,actorId,detail={}){
  await env.DB.prepare(`INSERT INTO messenger_events(thread_id,event_type,actor_kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(threadId,eventType,actorKind,clean(actorId,240),safeJson(detail),nowIso()).run();
}

async function findOrCreateThread(env,{storeSlug,externalThreadId,customerDisplay}){
  const existing=await env.DB.prepare(`SELECT t.id FROM messenger_threads t JOIN messenger_channel_links l ON l.thread_id=t.id WHERE t.subject_type='tenant' AND t.subject_key=? AND l.channel='sms' AND l.external_thread_id=? ORDER BY t.id DESC LIMIT 1`).bind(storeSlug,externalThreadId).first();
  if(existing?.id)return Number(existing.id);
  const now=nowIso();
  const inserted=await env.DB.prepare(`INSERT INTO messenger_threads(subject_type,subject_key,owner_user_id,title,status,target_service,created_by,created_at,updated_at) VALUES('tenant',?,?,?,?,?,?,?,?)`)
    .bind(storeSlug,'sms-customer',`문자주문 · ${clean(customerDisplay,80)||'고객'}`,'open','store-order','sms-bridge',now,now).run();
  const threadId=Number(inserted.meta?.last_row_id||0);
  if(!threadId)throw new Error('SMS_THREAD_CREATE_FAILED');
  await env.DB.prepare(`INSERT INTO messenger_channel_links(thread_id,channel,external_thread_id,status,metadata_json,created_at,updated_at) VALUES(?,'sms',?,'active','{}',?,?)`)
    .bind(threadId,externalThreadId,now,now).run();
  return threadId;
}

async function latestOpenOrder(env,storeSlug,threadId){
  return env.DB.prepare(`SELECT id,status,raw_order_text,thread_id,store_slug FROM store_sms_orders WHERE store_slug=? AND thread_id=? AND status IN ('awaiting_customer_confirmation','customer_confirmed','store_accepted') ORDER BY id DESC LIMIT 1`)
    .bind(storeSlug,threadId).first();
}

async function queueSmsReply(env,executionCtx,{threadId,body,eventType='store_sms.reply'}){
  const now=nowIso();
  const inserted=await env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(threadId,'ekodi-store-order','agent',clean(body),safeJson({channel:'sms',service:'store-order'}),now).run();
  const messageId=Number(inserted.meta?.last_row_id||0);
  if(!messageId)throw new Error('SMS_REPLY_MESSAGE_FAILED');
  await recordEvent(env,threadId,eventType,'system','ekodi-store-order',{messageId});
  const outbox=await enqueueMessengerOutbox(env,{threadId,messageId,eventType,consumer:'channel',payload:{channel:'sms'},idempotencyKey:`sms:channel:${messageId}`});
  const recovery=drainMessengerOutbox(env,{limit:4}).catch(()=>({processed:0,failed:1}));
  if(executionCtx?.waitUntil)executionCtx.waitUntil(recovery);
  return {messageId,outboxId:outbox?.id||null,status:outbox?.status||'queue_unavailable'};
}

async function handleInbound(request,env,executionCtx){
  if(request.method!=='POST')return json(request,env,{error:'METHOD_NOT_ALLOWED'},405);
  if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  if(String(env.ALLOW_MUTATIONS)!=='true')return json(request,env,{error:'MUTATIONS_DISABLED'},503);
  const authorized=await secretMatches(request,env);
  if(authorized===null)return json(request,env,{error:'SMS_INGRESS_NOT_CONFIGURED'},503);
  if(!authorized)return json(request,env,{error:'SMS_INGRESS_UNAUTHORIZED'},401);
  const data=await readJson(request);
  if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const storeSlug=clean(data.storeSlug,80).toLowerCase();
  const providerEventId=clean(data.providerEventId,240);
  const provider=clean(data.provider||'sms-bridge',80).toLowerCase();
  const externalThreadId=clean(data.externalThreadId,240);
  const text=clean(data.text,8000);
  const customerDisplay=safeCustomerDisplay(data.customerDisplay);
  if(!allowedStores(env).has(storeSlug))return json(request,env,{error:'STORE_NOT_ALLOWED'},403);
  if(!providerEventId||!externalThreadId||!text)return json(request,env,{error:'SMS_EVENT_FIELDS_REQUIRED'},400);
  if(!isOpaqueSmsThreadId(externalThreadId))return json(request,env,{error:'OPAQUE_THREAD_ID_REQUIRED'},400);
  const duplicate=await env.DB.prepare('SELECT order_id,thread_id FROM store_sms_ingress_events WHERE provider=? AND provider_event_id=?').bind(provider,providerEventId).first();
  if(duplicate)return json(request,env,{ok:true,idempotent:true,orderId:duplicate.order_id||null,threadId:duplicate.thread_id||null});
  const threadId=await findOrCreateThread(env,{storeSlug,externalThreadId,customerDisplay});
  const now=nowIso();
  const insertedMessage=await env.DB.prepare(`INSERT INTO messenger_messages(thread_id,author_user_id,author_kind,body,metadata_json,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(threadId,'sms-customer','human',text,safeJson({channel:'sms',customerDisplay,providerEventId}),now).run();
  const messageId=Number(insertedMessage.meta?.last_row_id||0);
  await recordEvent(env,threadId,'store_sms.inbound','human','sms-customer',{messageId,storeSlug,providerEventId});
  const input=classifySmsOrderInput(text);
  let order=await latestOpenOrder(env,storeSlug,threadId);
  let reply='',eventType='store_sms.reply';
  if(input==='confirm'&&order?.status==='awaiting_customer_confirmation'){
    await env.DB.prepare(`UPDATE store_sms_orders SET status='customer_confirmed',confirmed_at=?,updated_at=? WHERE id=?`).bind(now,now,order.id).run();
    order={...order,status:'customer_confirmed'};reply=customerSmsOrderReply('confirmed');eventType='store_sms.customer_confirmed';
  }else if(input==='cancel'&&order&&OPEN_STATES.includes(order.status)){
    await env.DB.prepare(`UPDATE store_sms_orders SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?`).bind(now,now,order.id).run();
    order={...order,status:'cancelled'};reply=customerSmsOrderReply('cancelled');eventType='store_sms.customer_cancelled';
  }else if(order?.status==='awaiting_customer_confirmation'&&input==='order_text'){
    await env.DB.prepare(`UPDATE store_sms_orders SET raw_order_text=?,customer_display=?,updated_at=? WHERE id=?`).bind(text,customerDisplay,now,order.id).run();
    order={...order,raw_order_text:text};reply=customerSmsOrderReply('updated',{orderText:text});eventType='store_sms.draft_updated';
  }else if(order&&['customer_confirmed','store_accepted'].includes(order.status)){
    reply=customerSmsOrderReply('pending',{status:order.status});eventType='store_sms.pending_notice';
  }else if(input==='order_text'||input==='confirm'||input==='cancel'){
    const created=await env.DB.prepare(`INSERT INTO store_sms_orders(store_slug,thread_id,status,raw_order_text,customer_display,created_at,updated_at) VALUES(?,?,'awaiting_customer_confirmation',?,?,?,?)`)
      .bind(storeSlug,threadId,text,customerDisplay,now,now).run();
    const orderId=Number(created.meta?.last_row_id||0);
    order={id:orderId,status:'awaiting_customer_confirmation',raw_order_text:text,thread_id:threadId,store_slug:storeSlug};
    reply=customerSmsOrderReply('draft',{orderText:text});eventType='store_sms.draft_created';
  }else{
    return json(request,env,{error:'EMPTY_SMS'},400);
  }
  await env.DB.prepare(`INSERT INTO store_sms_ingress_events(provider,provider_event_id,store_slug,thread_id,order_id,message_id,created_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(provider,providerEventId,storeSlug,threadId,order?.id||null,messageId,now).run();
  const queued=await queueSmsReply(env,executionCtx,{threadId,body:reply,eventType});
  return json(request,env,{ok:true,orderId:order?.id||null,threadId,status:order?.status||null,replyQueued:queued.status},201);
}

async function adminContext(request,env,{write=false}={}){
  const ctx=await resolveWorkspacePrincipal(request,env,{write});
  if(ctx.error)return {ctx,response:json(request,env,{error:ctx.error},ctx.status)};
  if(ctx.subject.type!=='tenant'||!allowedStores(env).has(String(ctx.subject.key).toLowerCase()))return {ctx,response:json(request,env,{error:'STORE_SUBJECT_REQUIRED'},403)};
  return {ctx,response:null};
}

async function listOrders(request,env){
  const {ctx,response}=await adminContext(request,env);if(response)return response;
  const rows=await env.DB.prepare(`SELECT id,store_slug,thread_id,status,raw_order_text,customer_display,confirmed_at,accepted_at,completed_at,cancelled_at,rejected_at,created_at,updated_at FROM store_sms_orders WHERE store_slug=? ORDER BY id DESC LIMIT 100`).bind(ctx.subject.key).all();
  await auditPrincipal(env,ctx.principal,'conversation:read');
  return json(request,env,{storeSlug:ctx.subject.key,orders:rows.results||[]});
}

async function actOnOrder(request,env,executionCtx,orderId){
  const {ctx,response}=await adminContext(request,env,{write:true});if(response)return response;
  const data=await readJson(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const action=clean(data.action,40).toLowerCase();
  const order=await env.DB.prepare(`SELECT id,store_slug,thread_id,status,raw_order_text FROM store_sms_orders WHERE id=? AND store_slug=?`).bind(orderId,ctx.subject.key).first();
  if(!order)return json(request,env,{error:'ORDER_NOT_FOUND'},404);
  const now=nowIso();let next='',reply='',eventType='';
  if(action==='accept'&&order.status==='customer_confirmed'){next='store_accepted';reply=customerSmsOrderReply('accepted',{orderText:order.raw_order_text});eventType='store_sms.store_accepted'}
  else if(action==='reject'&&['awaiting_customer_confirmation','customer_confirmed'].includes(order.status)){next='rejected';reply=customerSmsOrderReply('rejected');eventType='store_sms.store_rejected'}
  else if(action==='complete'&&order.status==='store_accepted'){next='completed';reply=customerSmsOrderReply('completed');eventType='store_sms.completed'}
  else if(action==='cancel'&&['customer_confirmed','store_accepted'].includes(order.status)){next='cancelled';reply=customerSmsOrderReply('cancelled');eventType='store_sms.store_cancelled'}
  else return json(request,env,{error:'INVALID_ORDER_TRANSITION',status:order.status,action},409);
  const column={store_accepted:'accepted_at',rejected:'rejected_at',completed:'completed_at',cancelled:'cancelled_at'}[next];
  await env.DB.prepare(`UPDATE store_sms_orders SET status=?,${column}=?,updated_at=? WHERE id=? AND store_slug=?`).bind(next,now,now,order.id,ctx.subject.key).run();
  await recordEvent(env,order.thread_id,eventType,'human',ctx.principal.id,{orderId:order.id,storeSlug:ctx.subject.key});
  const queued=await queueSmsReply(env,executionCtx,{threadId:order.thread_id,body:reply,eventType});
  await auditPrincipal(env,ctx.principal,'conversation:write');
  return json(request,env,{ok:true,orderId:order.id,status:next,replyQueued:queued.status});
}

export async function handleStoreSmsOrderApi(request,env,executionCtx){
  const url=new URL(request.url);
  if(url.pathname==='/v1/store-sms/inbound')return handleInbound(request,env,executionCtx);
  if(!url.pathname.startsWith('/v1/store-sms/'))return null;
  const {allowed,headers}=cors(request,env);
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
  if(!allowed)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  if(request.method==='GET'&&url.pathname==='/v1/store-sms/orders')return listOrders(request,env);
  const match=url.pathname.match(/^\/v1\/store-sms\/orders\/(\d+)\/actions$/);
  if(match&&request.method==='POST')return actOnOrder(request,env,executionCtx,toId(match[1]));
  return json(request,env,{error:'NOT_FOUND'},404);
}
