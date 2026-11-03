import test from 'node:test';
import assert from 'node:assert/strict';
import {handleNotificationApi,topicPublisherReadiness,NOTIFICATION_TOPICS} from '../notification-control.js';

const missionSecret='mission_only_secret_012345678901234567890123';
const churchSecret='church_only_secret_012345678901234567890123';
const globalSecret='global_legacy_secret_012345678901234567890123';
const event={idempotencyKey:'mission:guard:20261104',serviceId:'mission',topic:'mission',
  title:'공개된 묵상',body:'구독한 사용자에게 표시할 내용',targetPath:'/ekodimission/'};
function sender(payload=event,secret=missionSecret,origin=null){
  return new Request('https://ekodi.kr/api/notifications/events',{
    method:'POST',headers:{'content-type':'application/json',
      'x-ekodi-notification-secret':secret,...(origin?{origin}:{})},
    body:JSON.stringify(payload)
  });
}
function database(){
  let inserts=0;
  const DB={prepare(sql){assert.match(sql,/INSERT OR IGNORE INTO notification_events/);
    return {bind(){return {async run(){inserts++;return {meta:{changes:1}}}}}}}};
  return {DB,get inserts(){return inserts}};
}
test('per-topic readiness fails closed with neither flag nor isolated credentials',()=>{
  assert.deepEqual(topicPublisherReadiness({},'mission'),
    {enabled:false,credentialsConfigured:false,ready:false});
  assert.deepEqual(topicPublisherReadiness({NOTIFICATION_EVENT_SECRET:globalSecret},'mission'),
    {enabled:false,credentialsConfigured:false,ready:false});
  assert.deepEqual(topicPublisherReadiness({
    NOTIFICATION_EVENT_SECRET_MISSION:missionSecret},'mission'),
    {enabled:false,credentialsConfigured:true,ready:false});
  assert.deepEqual(topicPublisherReadiness({
    NOTIFICATION_PUBLISH_MISSION_ENABLED:'true'},'mission'),
    {enabled:true,credentialsConfigured:false,ready:false});
  assert.deepEqual(topicPublisherReadiness({
    NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',
    NOTIFICATION_EVENT_SECRET_MISSION:missionSecret},'mission'),
    {enabled:true,credentialsConfigured:true,ready:true});
  assert.equal(topicPublisherReadiness({},'__proto__').ready,false);
});
test('global event secret cannot authorize any topic without explicit isolated key and flag',async()=>{
  const db=database();
  for(const topic of Object.keys(NOTIFICATION_TOPICS)){
    const payload={...event,topic,serviceId:topic,
      targetPath:({mission:'/ekodimission/',church:'/ekodichurch/',community:'/cheonggye/',
        education:'/edu/',books:'/ekodibooks/',mall:'/ekodimall/',seonammedi:'/seonammedi/'})[topic]};
    const response=await handleNotificationApi(sender(payload,globalSecret),{...db,
      NOTIFICATION_EVENT_SECRET:globalSecret});
    assert.equal(response.status,403,topic);
  }
  assert.equal(db.inserts,0);
});
test('a correctly signed event still fails if topic-specific switch is off',async()=>{
  const db=database();
  const response=await handleNotificationApi(sender(),{...db,
    NOTIFICATION_EVENT_SECRET_MISSION:missionSecret,NOTIFICATION_EVENT_SECRET:globalSecret});
  assert.equal(response.status,403);
  assert.equal(db.inserts,0);
});
test('enabling switch without the topic secret does not unlock the global secret',async()=>{
  const db=database();
  const response=await handleNotificationApi(sender(event,globalSecret),{...db,
    NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',NOTIFICATION_EVENT_SECRET:globalSecret});
  assert.equal(response.status,403);assert.equal(db.inserts,0);
});
test('wrong tenant credential and browser-origin requests are always denied',async()=>{
  const db=database();
  const env={...db,NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',
    NOTIFICATION_EVENT_SECRET_MISSION:missionSecret,
    NOTIFICATION_PUBLISH_CHURCH_ENABLED:'true',
    NOTIFICATION_EVENT_SECRET_CHURCH:churchSecret};
  assert.equal((await handleNotificationApi(sender(event,churchSecret),env)).status,403);
  assert.equal((await handleNotificationApi(sender(event,missionSecret,'https://ekodi.kr'),env)).status,403);
  assert.equal(db.inserts,0);
});
test('correct enabled per-service credential accepts only matching service and topic',async()=>{
  const db=database();
  const env={...db,NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',
    NOTIFICATION_EVENT_SECRET_MISSION:missionSecret};
  assert.equal((await handleNotificationApi(sender(event,missionSecret),env)).status,202);
  assert.equal(db.inserts,1);
  const mismatched={...event,serviceId:'church'};
  assert.equal((await handleNotificationApi(sender(mismatched,missionSecret),env)).status,400);
  assert.equal(db.inserts,1);
});
