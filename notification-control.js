import {approvedPushEndpoint, sendWebPush, unb64} from './notification-webpush.js';

export const NOTIFICATION_TOPICS = Object.freeze({
  church:'에코디교회', mission:'에코디선교회', community:'청계·지역',
  education:'에코디교육', books:'출판·서점',
  mall:'에코디몰', seonammedi:'서남권 국립의대'
});
const TOPIC_PATH = Object.freeze({
  church:'/ekodichurch', mission:'/ekodimission', community:'/cheonggye',
  education:'/edu', books:'/ekodibooks', mall:'/ekodimall',
  seonammedi:'/seonammedi'
});
const VERSION='2026-11';
const MAX_BYTES=8192;
const NOW=()=>new Date().toISOString();

function json(value,status=200) {
  return new Response(JSON.stringify(value),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer'
  }});
}
function error(code,status) { return json({ok:false,error:code},status); }
function enabled(env) {
  return env.NOTIFICATIONS_SEND_ENABLED === 'true'
    && Boolean(env.NOTIFICATION_VAPID_PUBLIC_KEY)
    && Boolean(env.NOTIFICATION_VAPID_PRIVATE_JWK);
}
async function sha(value) {
  const bytes=new TextEncoder().encode(value);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('');
}
function validTopics(topics) {
  return Array.isArray(topics) && topics.length>0 && topics.length<=7
    && topics.every(v=>typeof v==='string' && Object.hasOwn(NOTIFICATION_TOPICS,v))
    && new Set(topics).size===topics.length;
}
function sameOrigin(request) {
  const origin=request.headers.get('origin');
  return Boolean(origin) && origin === new URL(request.url).origin;
}
async function readBody(request) {
  const raw=await request.text();
  if (new TextEncoder().encode(raw).length>MAX_BYTES) throw new Error('request_too_large');
  return JSON.parse(raw);
}
function tokenOf(request) {
  const auth=String(request.headers.get('authorization')||'');
  return /^Bearer [A-Za-z0-9_-]{43,128}$/.test(auth) ? auth.slice(7) : '';
}
function validSubscription(input) {
  const value=input?.subscription;
  if (!value || !approvedPushEndpoint(value.endpoint) || typeof value.endpoint!=='string'
    || value.endpoint.length>2048 || !value.keys) return false;
  try {
    const publicKey=unb64(value.keys.p256dh), auth=unb64(value.keys.auth);
    return publicKey.length===65 && publicKey[0]===4 && auth.length===16;
  } catch { return false; }
}
function validPath(topic,path) {
  const root=TOPIC_PATH[topic];
  return typeof path==='string' && path.length<=240 && path.startsWith(root)
    && (path.length===root.length || '/?#'.includes(path[root.length]))
    && !path.includes('\\') && !path.includes('//')
    && !/[\r\n\x00-\x1f]/.test(path);
}
async function getDevice(request,env) {
  const token=tokenOf(request);
  if (!token) return null;
  return env.DB.prepare('SELECT id, topics_json, consent_at FROM notification_devices WHERE token_hash=? AND disabled_at IS NULL')
    .bind(await sha(token)).first();
}
async function throttle(request,env) {
  if (!env.AUTH_RATE_LIMITER?.limit) return true;
  const ip=String(request.headers.get('cf-connecting-ip')||'unknown');
  const result=await env.AUTH_RATE_LIMITER.limit({key:'notifications:'+ip});
  return result?.success!==false;
}
async function authorizedEvent(request,env) {
  const secret=String(env.NOTIFICATION_EVENT_SECRET||'');
  const submitted=String(request.headers.get('x-ekodi-notification-secret')||'');
  if (secret.length<32 || submitted.length!==secret.length || request.headers.get('origin')) return false;
  const a=await sha(secret), b=await sha(submitted);
  return a===b;
}
export async function handleNotificationApi(request,env) {
  const path=new URL(request.url).pathname;
  if (!path.startsWith('/api/notifications')) return null;
  if (!env.DB?.prepare) return error('notification_storage_unavailable',503);
  if (request.method==='OPTIONS') return error('cross_origin_not_supported',403);
  if (path==='/api/notifications/config' && request.method==='GET') {
    return json({ok:true,enabled:enabled(env),topics:NOTIFICATION_TOPICS,consentVersion:VERSION,
      vapidPublicKey:enabled(env)?env.NOTIFICATION_VAPID_PUBLIC_KEY:null,
      channels:{inbox:true,webPush:enabled(env),email:false,sms:false}});
  }
  if (path==='/api/notifications/events' && request.method==='POST') {
    if (!await authorizedEvent(request,env)) return error('event_auth_required',403);
    let body;
    try { body=await readBody(request); } catch { return error('invalid_json',400); }
    const topic=body?.topic, service=body?.serviceId;
    if (!Object.hasOwn(NOTIFICATION_TOPICS,topic) || service!==topic) return error('service_topic_mismatch',400);
    if (typeof body.idempotencyKey!=='string'|| !/^[A-Za-z0-9:_-]{12,120}$/.test(body.idempotencyKey)) return error('idempotency_required',400);
    if (typeof body.title!=='string'||!body.title.trim()||body.title.length>100||
        typeof body.body!=='string'||!body.body.trim()||body.body.length>240) return error('invalid_content',400);
    if (!validPath(topic,body.targetPath)) return error('invalid_target_path',400);
    const scheduled=new Date(body.scheduledAt||NOW());
    if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime()<Date.now()-60000 || scheduled.getTime()>Date.now()+30*86400000)
      return error('invalid_schedule',400);
    const id=crypto.randomUUID(), time=NOW();
    await env.DB.prepare('INSERT OR IGNORE INTO notification_events (id,idempotency_key,service_id,topic,title,body,target_path,scheduled_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(id,body.idempotencyKey,service,topic,body.title.trim(),body.body.trim(),body.targetPath,scheduled.toISOString(),time).run();
    return json({ok:true,accepted:true,idempotencyKey:body.idempotencyKey},202);
  }
  if (!['GET','POST','PATCH','DELETE'].includes(request.method)) return error('method_not_allowed',405);
  if (path==='/api/notifications/subscription' && request.method==='POST') {
    if (!sameOrigin(request)) return error('origin_required',403);
    if (!await throttle(request,env)) return error('rate_limited',429);
    if (!enabled(env)) return error('push_not_available',503);
    let body;
    try { body=await readBody(request); } catch { return error('invalid_json',400); }
    if (!/^[-_A-Za-z0-9]{43,128}$/.test(String(body?.deviceToken||''))) return error('device_token_required',400);
    if (!validTopics(body?.topics)||!validSubscription(body)||body.consentVersion!==VERSION||body.marketingConsent!==false)
      return error('valid_explicit_consent_required',400);
    const tokenHash=await sha(body.deviceToken), time=NOW(), sub=body.subscription;
    const id=crypto.randomUUID();
    // Expired endpoints may be re-registered from a fresh browser token.
    await env.DB.prepare('DELETE FROM notification_devices WHERE endpoint=? AND disabled_at IS NOT NULL').bind(sub.endpoint).run();
    try {
      await env.DB.prepare(
        'INSERT INTO notification_devices (id,token_hash,endpoint,p256dh,auth_secret,topics_json,consent_version,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) '+
        'ON CONFLICT(token_hash) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,topics_json=excluded.topics_json,consent_version=excluded.consent_version,consent_at=excluded.consent_at,updated_at=excluded.updated_at,disabled_at=NULL'
      ).bind(id,tokenHash,sub.endpoint,sub.keys.p256dh,sub.keys.auth,JSON.stringify(body.topics),VERSION,time,time,time).run();
    } catch (err) {
      if (String(err?.message||'').includes('UNIQUE')) return error('endpoint_already_registered',409);
      throw err;
    }
    return json({ok:true,topics:body.topics,consentVersion:VERSION},201);
  }
  if (!['/api/notifications/preferences','/api/notifications/inbox','/api/notifications/subscription'].includes(path))
    return error('not_found',404);
  const device=await getDevice(request,env);
  if (!device) return error('device_auth_required',401);
  if (path==='/api/notifications/preferences' && request.method==='GET')
    return json({ok:true,topics:JSON.parse(device.topics_json),consentAt:device.consent_at});
  if (path==='/api/notifications/inbox' && request.method==='GET') {
    const rows=await env.DB.prepare(
      'SELECT e.id,e.service_id,e.title,e.body,e.target_path,e.created_at FROM notification_deliveries d '+
      'JOIN notification_events e ON e.id=d.event_id WHERE d.device_id=? AND d.status IN (\'pending\',\'processing\',\'delivered\',\'failed\') '+
      'ORDER BY e.created_at DESC LIMIT 30'
    ).bind(device.id).all();
    return json({ok:true,items:rows.results||[]});
  }
  if (!sameOrigin(request)) return error('origin_required',403);
  if (path==='/api/notifications/preferences' && request.method==='PATCH') {
    let body;
    try { body=await readBody(request); } catch { return error('invalid_json',400); }
    if (!validTopics(body?.topics)) return error('invalid_topics',400);
    await env.DB.prepare('UPDATE notification_devices SET topics_json=?,updated_at=? WHERE id=?')
      .bind(JSON.stringify(body.topics),NOW(),device.id).run();
    await env.DB.prepare("DELETE FROM notification_deliveries WHERE device_id=? AND status='pending' AND event_id IN (SELECT id FROM notification_events WHERE topic NOT IN (SELECT value FROM json_each(?)))")
      .bind(device.id,JSON.stringify(body.topics)).run();
    return json({ok:true,topics:body.topics});
  }
  if (path==='/api/notifications/subscription' && request.method==='DELETE') {
    await env.DB.prepare('DELETE FROM notification_devices WHERE id=?').bind(device.id).run();
    return json({ok:true,unsubscribed:true});
  }
  return error('method_not_allowed',405);
}
export async function runNotificationSchedule(env,{now=NOW(),limit=12,transport=fetch}={}) {
  if (!enabled(env)||!env.DB?.prepare) return {enabled:false,processed:0};
  const db=env.DB;
  const due=await db.prepare("SELECT id,topic FROM notification_events WHERE status='pending' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 3").bind(now).all();
  for (const event of due.results||[]) {
    const subscriberCount=await db.prepare("SELECT count(*) AS n FROM notification_devices WHERE disabled_at IS NULL AND EXISTS (SELECT 1 FROM json_each(topics_json) WHERE value=?)").bind(event.topic).first();
    if (Number(subscriberCount?.n||0)>5000) { console.error('Notification fanout cap exceeded',event.id); continue; }
    await db.prepare(
      "INSERT OR IGNORE INTO notification_deliveries(event_id,device_id,status,next_attempt_at) "+
      "SELECT ?,id,'pending',? FROM notification_devices WHERE disabled_at IS NULL AND EXISTS (SELECT 1 FROM json_each(topics_json) WHERE value=?)"
    ).bind(event.id,now,event.topic).run();
    await db.prepare("UPDATE notification_events SET status='fanout' WHERE id=? AND status='pending'").bind(event.id).run();
  }
  // Consent revocation always wins over queued delivery and stale fanout.
  await db.prepare("DELETE FROM notification_deliveries WHERE status='pending' AND NOT EXISTS (SELECT 1 FROM notification_events e JOIN notification_devices dev ON dev.id=notification_deliveries.device_id JOIN json_each(dev.topics_json) j ON j.value=e.topic WHERE e.id=notification_deliveries.event_id AND dev.disabled_at IS NULL)").run();
  const expiry=new Date(new Date(now).getTime()-15*60000).toISOString();
  await db.prepare("UPDATE notification_deliveries SET status='pending',locked_at=NULL WHERE status='processing' AND locked_at<?").bind(expiry).run();
  const rows=await db.prepare(
    "SELECT d.event_id,d.device_id,d.attempts,dev.endpoint,dev.p256dh,dev.auth_secret, "+
    "e.title,e.body,e.target_path,e.service_id FROM notification_deliveries d "+
    "JOIN notification_events e ON e.id=d.event_id JOIN notification_devices dev ON dev.id=d.device_id "+
    "WHERE d.status='pending' AND d.next_attempt_at<=? AND dev.disabled_at IS NULL "+
    "AND EXISTS (SELECT 1 FROM json_each(dev.topics_json) WHERE value=e.topic) ORDER BY d.next_attempt_at LIMIT ?"
  ).bind(now,Math.max(1,Math.min(25,limit))).all();
  let processed=0, failed=0;
  for (const row of rows.results||[]) {
    const claim=await db.prepare(
      "UPDATE notification_deliveries SET status='processing',locked_at=? WHERE event_id=? AND device_id=? AND status='pending'"
    ).bind(now,row.event_id,row.device_id).run();
    if (!claim.meta?.changes) continue;
    const attempts=Number(row.attempts||0)+1;
    let status=0, ok=false, reason='';
    try {
      const result=await sendWebPush(row,{title:row.title,body:row.body,targetPath:row.target_path,service:row.service_id},env,transport);
      status=result.status;ok=result.ok;
    } catch (err) { reason=String(err?.message||'send_failed').slice(0,120); }
    if (ok) {
      await db.prepare("UPDATE notification_deliveries SET status='delivered',attempts=?,delivered_at=?,locked_at=NULL,last_error='' WHERE event_id=? AND device_id=?")
        .bind(attempts,now,row.event_id,row.device_id).run();
      processed++;
    } else {
      const terminal=attempts>=4||[400,401,403,404,410,413].includes(status);
      const next=new Date(new Date(now).getTime()+Math.min(3600,2**attempts*60)*1000).toISOString();
      await db.prepare("UPDATE notification_deliveries SET status=?,attempts=?,next_attempt_at=?,locked_at=NULL,last_error=? WHERE event_id=? AND device_id=?")
        .bind(terminal?'failed':'pending',attempts,next,reason||('http_'+status),row.event_id,row.device_id).run();
      if ([404,410].includes(status)) await db.prepare('UPDATE notification_devices SET disabled_at=? WHERE id=?').bind(now,row.device_id).run();
      failed++;
    }
  }
  await db.prepare("UPDATE notification_events SET status='done' WHERE status='fanout' AND NOT EXISTS (SELECT 1 FROM notification_deliveries WHERE event_id=notification_events.id AND status IN ('pending','processing'))").run();
  return {enabled:true,processed,failed};
}
