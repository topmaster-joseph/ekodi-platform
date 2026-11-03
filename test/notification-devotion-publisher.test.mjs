import test from 'node:test';
import assert from 'node:assert/strict';
import {devotionalNotificationEvent,publishDevotionalNotifications,seoulNotificationDate} from '../notification-devotion-publisher.js';
import {handleNotificationApi} from '../notification-control.js';

const now=new Date('2026-11-02T09:00:00.000Z');
const date='2026-11-02';
const longSecret='mission_secret_for_server_only_012345678901234567';
test('a verified current Seoul date is required; no draft/future publication is projected',()=>{
  assert.equal(seoulNotificationDate(now),date);
  assert.equal(devotionalNotificationEvent('mission',{date:'2026-11-03',passage:'시편 1:1',now}),null);
  assert.equal(devotionalNotificationEvent('mission',{date,passage:'',now}),null);
  assert.equal(devotionalNotificationEvent('unknown',{date,passage:'시편 1:1',now}),null);
  const event=devotionalNotificationEvent('mission',{date,passage:'시편 1:1',now});
  assert.deepEqual([event.topic,event.serviceId,event.targetPath,event.idempotencyKey],['mission','mission','/ekodimission/','mission:devotion:20261102']);
  assert.equal(event.body.includes('시편 1:1'),true);
});
test('publication defaults off, refuses missing secret and future dates, never emits network requests',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return {status:202}};
  const disabled=await publishDevotionalNotifications({}, {date,passage:'시편 1:1',now,transport});
  assert.deepEqual(disabled.map(r=>r.status),['disabled','disabled']);
  const blocked=await publishDevotionalNotifications({NOTIFICATION_PUBLISH_MISSION_ENABLED:'true'}, {date,passage:'시편 1:1',now,transport});
  assert.deepEqual(blocked.map(r=>r.status),['disabled','secret_unavailable']);
  const future=await publishDevotionalNotifications({NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',NOTIFICATION_EVENT_SECRET_MISSION:longSecret},
    {date:'2026-11-03',passage:'시편 1:1',now,transport});
  assert.equal(future[1].status,'not_current_published_day');
  assert.equal(calls,0);
});
test('explicit church/mission flags use separate signed topics without client credentials',async()=>{
  const sent=[];
  const env={NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',NOTIFICATION_EVENT_SECRET_MISSION:longSecret,
    NOTIFICATION_PUBLISH_CHURCH_ENABLED:'true',NOTIFICATION_EVENT_SECRET_CHURCH:'church_server_only_secret_012345678901234567'};
  const receipts=await publishDevotionalNotifications(env,{date,passage:'고린도전서 2:6-16',now,
    transport:async(url,init)=>{sent.push({url,init});return {status:202}}});
  assert.deepEqual(receipts.map(r=>r.status),['accepted','accepted']);
  assert.equal(sent.length,2);
  for(const {url,init} of sent){
    assert.equal(url,'https://ekodi.kr/api/notifications/events');
    assert.equal(init.method,'POST');assert.equal(init.headers.origin,undefined);
    const event=JSON.parse(init.body);
    assert.equal(event.serviceId,event.topic);
    assert.equal(event.targetPath,event.topic==='church'?'/ekodichurch/':'/ekodimission/');
    assert.equal(init.headers['x-ekodi-notification-secret'],env['NOTIFICATION_EVENT_SECRET_'+event.topic.toUpperCase()]);
    assert.match(event.idempotencyKey,/:devotion:20261102$/);
  }
});
test('topic-specific server credentials supersede the legacy global event secret',async()=>{
  let inserted=0;
  const env={NOTIFICATION_EVENT_SECRET:'global_legacy_secret_for_events_123456789',
    NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',NOTIFICATION_EVENT_SECRET_MISSION:longSecret,
    DB:{prepare(){return {bind(){return {async run(){inserted++;return {meta:{changes:1}}}}}}}}};
  const body={idempotencyKey:'mission:devotion:20261102',serviceId:'mission',topic:'mission',
    title:'에코디 매일묵상',body:'발행된 말씀',targetPath:'/ekodimission/'};
  const request=secret=>new Request('https://ekodi.kr/api/notifications/events',{method:'POST',
    headers:{'content-type':'application/json','x-ekodi-notification-secret':secret},body:JSON.stringify(body)});
  assert.equal((await handleNotificationApi(request(env.NOTIFICATION_EVENT_SECRET),env)).status,403);
  assert.equal((await handleNotificationApi(request(longSecret),env)).status,202);
  assert.equal(inserted,1);
});

import {saveDevotionOverride} from '../devotional-admin-api.js';
test('editor queues only after successful draft-to-published transition',async()=>{
  let row=null,notifications=0,fetches=0;
  const env={DB:{prepare(sql){return {bind(...args){return {
    async first(){return row},
    async run(){
      if(sql.includes('INSERT OR IGNORE')){
        if(row)return {meta:{changes:0}};
        row={activities_json:args[1],status:args[2],revision:1,updated_at:args[4]};
        return {meta:{changes:1}};
      }
      if(sql.includes('UPDATE devotion_activity_overrides')){
        if(!row||row.revision!==args[5])return {meta:{changes:0}};
        row={activities_json:args[0],status:args[1],revision:row.revision+1,updated_at:args[3]};
        return {meta:{changes:1}};
      }
      throw Error('unexpected_sql');
    }
  }}}}}};
  const editor={email:'verified-admin@example.test'};
  const ctx={waitUntil(p){notifications++;Promise.resolve(p).catch(()=>{})}};
  const activities={theme:'오늘의 묵상',keyLine:'말씀',questions:[{kind:'질문',text:'어떤 말씀인가?'}],action:'말씀대로 살기',prayer:'감사합니다'};
  const resolve=()=>({found:true,passage:'고린도전서 2:6-16'});
  const saved=async(status,expectedRevision,date=seoulNotificationDate())=>{
    const request=new Request('https://ekodi.kr/api/bible/devotion',{method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({date,status,expectedRevision,activities})});
    return saveDevotionOverride(request,env,editor,resolve,ctx);
  };
  assert.equal((await saved('draft',0)).status,200);
  assert.equal(notifications,0);
  assert.equal((await saved('published',1)).status,200);
  assert.equal(notifications,1);
  assert.equal((await saved('published',2)).status,200);
  assert.equal(notifications,1);
  assert.equal((await saved('draft',3)).status,200);
  assert.equal((await saved('published',4,new Date(Date.now()+3*86400000).toISOString().slice(0,10))).status,200);
  // Future-dated publication cannot even schedule a notification attempt.
  assert.equal(notifications,1);
  assert.equal(fetches,0);
  const forbidden=await saveDevotionOverride(new Request('https://ekodi.kr/api/bible/devotion',{method:'PUT',
    body:JSON.stringify({date:seoulNotificationDate(),status:'published',expectedRevision:5,activities})}),env,null,resolve,ctx);
  assert.equal(forbidden.status,403);
  assert.equal(notifications,1);
});
