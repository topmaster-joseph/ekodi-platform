import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleNotificationApi,runNotificationSchedule} from '../notification-control.js';
import {approvedPushEndpoint,b64,encryptWebPush} from '../notification-webpush.js';

function database(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync(new URL('../migrations/202611020100_notification_core.sql',import.meta.url),'utf8'));
  return {
    raw:sql,
    prepare(source){
      return {
        bind(...params){
          const statement=sql.prepare(source);
          return {
            async run(){const result=statement.run(...params);return {meta:{changes:result.changes}}},
            async first(){return statement.get(...params)||null},
            async all(){return {results:statement.all(...params)}}
          };
        },
        async run(){const result=sql.prepare(source).run();return {meta:{changes:result.changes}}}
      };
    }
  };
}
function request(path,method='GET',body=null,headers={}){
  return new Request('https://ekodi.kr'+path,{
    method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
function json(response){return response.json()}
async function keys(){
  const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  return {
    privateJwk:JSON.stringify(await crypto.subtle.exportKey('jwk',vapid.privateKey)),
    publicKey:b64(new Uint8Array(await crypto.subtle.exportKey('raw',vapid.publicKey))),
    p256dh:b64(new Uint8Array(await crypto.subtle.exportKey('raw',receiver.publicKey))),
    auth:b64(crypto.getRandomValues(new Uint8Array(16)))
  };
}
function environment(db,vapid){
  return {DB:db,NOTIFICATIONS_SEND_ENABLED:'true',NOTIFICATION_VAPID_PUBLIC_KEY:vapid.publicKey,
    NOTIFICATION_VAPID_PRIVATE_JWK:vapid.privateJwk,NOTIFICATION_EVENT_SECRET:'test_internal_event_secret_12345678901234567890'};
}
const consent='2026-11';
test('push endpoints are allowlisted and reject internal SSRF targets',()=>{
  assert.equal(approvedPushEndpoint('https://fcm.googleapis.com/fcm/send/a'),true);
  assert.equal(approvedPushEndpoint('https://api.push.apple.com/3/device/xyz'),true);
  assert.equal(approvedPushEndpoint('http://fcm.googleapis.com/fcm/send/a'),false);
  assert.equal(approvedPushEndpoint('https://localhost/secret'),false);
  assert.equal(approvedPushEndpoint('https://fcm.googleapis.com.evil.invalid/'),false);
});
test('config fails closed without a server key, unrelated routes delegate',async()=>{
  const env={DB:database()};
  assert.equal(await handleNotificationApi(request('/api/other'),env),null);
  assert.equal((await json(await handleNotificationApi(request('/api/notifications/config'),env))).enabled,false);
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',{}, {origin:'https://ekodi.kr'}),env)).status,503);
});
test('explicit opt-in, namespace isolation, dedup, delivery and unsubscribe',async()=>{
  const db=database(),vapid=await keys(),env=environment(db,vapid);
  const deviceToken=b64(crypto.getRandomValues(new Uint8Array(32)));
  const endpoint='https://fcm.googleapis.com/fcm/send/token-123';
  const subscribe={deviceToken,topics:['mission'],consentVersion:consent,marketingConsent:false,
    subscription:{endpoint,keys:{p256dh:vapid.p256dh,auth:vapid.auth}}};
  const origin={origin:'https://ekodi.kr'};
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',subscribe,{origin:'https://evil.example'}),env)).status,403);
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',{...subscribe,marketingConsent:true},origin),env)).status,400);
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',subscribe,origin),env)).status,201);
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',subscribe,origin),env)).status,201);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM notification_devices').get().n,1);
  const bearer={authorization:'Bearer '+deviceToken};
  const prefs=await json(await handleNotificationApi(request('/api/notifications/preferences','GET',null,bearer),env));
  assert.deepEqual(prefs.topics,['mission']);
  assert.equal((await handleNotificationApi(request('/api/notifications/events','POST',{}),env)).status,403);
  const event={idempotencyKey:'mission:daily:20261102',serviceId:'mission',topic:'mission',
    title:'매일 묵상',body:'오늘의 말씀을 읽어보세요.',targetPath:'/ekodimission/'};
  const sender={'x-ekodi-notification-secret':env.NOTIFICATION_EVENT_SECRET};
  assert.equal((await handleNotificationApi(request('/api/notifications/events','POST',{...event,targetPath:'//evil.example/'},sender),env)).status,400);
  assert.equal((await handleNotificationApi(request('/api/notifications/events','POST',event,sender),env)).status,202);
  assert.equal((await handleNotificationApi(request('/api/notifications/events','POST',event,sender),env)).status,202);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM notification_events').get().n,1);
  let sent=0;
  const result=await runNotificationSchedule(env,{transport:async(url,options)=>{
    assert.equal(url,endpoint);assert.equal(options.method,'POST');
    assert.equal(options.headers['content-encoding'],'aes128gcm');
    assert.ok(options.body.byteLength>100);
    sent++;return {ok:true,status:201};
  }});
  assert.equal(result.processed,1);assert.equal(sent,1);
  assert.equal(db.raw.prepare('SELECT status FROM notification_events').get().status,'done');
  await runNotificationSchedule(env,{transport:async()=>{sent++;return {ok:true,status:201}}});
  assert.equal(sent,1);
  const items=await json(await handleNotificationApi(request('/api/notifications/inbox','GET',null,bearer),env));
  assert.equal(items.items.length,1);assert.equal(items.items[0].service_id,'mission');
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','DELETE',null,{...bearer,...origin}),env)).status,200);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM notification_devices').get().n,0);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM notification_deliveries').get().n,0);
});
test('payload encryption uses WebCrypto, emits framed aes128gcm',async()=>{
  const vapid=await keys();
  const result=await encryptWebPush({title:'test',targetPath:'/ekodimission'},vapid.p256dh,vapid.auth);
  assert.equal(result.length>120,true);
  assert.equal(result[20],65);
  await assert.rejects(encryptWebPush({},vapid.p256dh,'invalid-auth'),/invalid_push_keys|invalid_base64/);
});

test('topic opt-out before delivery stops push without changing other subscriptions',async()=>{
  const db=database(),vapid=await keys(),env=environment(db,vapid);
  const deviceToken=b64(crypto.getRandomValues(new Uint8Array(32)));
  const origin={origin:'https://ekodi.kr'};
  const sub={deviceToken,topics:['mission'],consentVersion:consent,marketingConsent:false,
    subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/topic-optout-1',keys:{p256dh:vapid.p256dh,auth:vapid.auth}}};
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',sub,origin),env)).status,201);
  const publisher={idempotencyKey:'mission:topic:optout:20261102',serviceId:'mission',topic:'mission',
    title:'새 묵상',body:'알림 취소를 검증합니다.',targetPath:'/ekodimission/'};
  await handleNotificationApi(request('/api/notifications/events','POST',publisher,{'x-ekodi-notification-secret':env.NOTIFICATION_EVENT_SECRET}),env);
  const patch=await handleNotificationApi(request('/api/notifications/preferences','PATCH',{topics:['church']},{...origin,authorization:'Bearer '+deviceToken}),env);
  assert.equal(patch.status,200);
  let sent=0;
  await runNotificationSchedule(env,{transport:async()=>{sent++;return {ok:true,status:201}}});
  assert.equal(sent,0);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM notification_deliveries').get().n,0);
});

test('expired push endpoint can be re-registered without reviving obsolete token',async()=>{
  const db=database(),k=await keys(),env=environment(db,k);
  const endpoint='https://fcm.googleapis.com/fcm/send/expired-123';
  const oldToken=b64(crypto.getRandomValues(new Uint8Array(32)));
  const payload={deviceToken:oldToken,topics:['church'],consentVersion:consent,marketingConsent:false,
    subscription:{endpoint,keys:{p256dh:k.p256dh,auth:k.auth}}};
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',payload,{origin:'https://ekodi.kr'}),env)).status,201);
  db.raw.prepare('UPDATE notification_devices SET disabled_at=?').run(new Date().toISOString());
  const nextToken=b64(crypto.getRandomValues(new Uint8Array(32)));
  assert.equal((await handleNotificationApi(request('/api/notifications/subscription','POST',{...payload,deviceToken:nextToken},{origin:'https://ekodi.kr'}),env)).status,201);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM notification_devices').get().n,1);
  assert.equal((await handleNotificationApi(request('/api/notifications/preferences','GET',null,{authorization:'Bearer '+oldToken}),env)).status,401);
  assert.equal((await handleNotificationApi(request('/api/notifications/preferences','GET',null,{authorization:'Bearer '+nextToken}),env)).status,200);
});
