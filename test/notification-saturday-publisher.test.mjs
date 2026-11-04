import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missionSaturdayNoticeWindow,missionSaturdayNoticeEvent,runMissionSaturdayNotice
} from '../notification-saturday-publisher.js';

const day=new Date('2026-11-06T00:15:00Z'); // Friday 09:15 Asia/Seoul
const meeting={date:'2026-11-07',time:'17:00',status:'scheduled',
  venue:'에코디교회',title:'토요 성경토론과 함께하는 식사'};
const secret='mission-exclusive-secret-012345678901234567890123';
const configured={
  NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED:'true',
  NOTIFICATION_PUBLISH_MISSION_ENABLED:'true',
  NOTIFICATION_EVENT_SECRET_MISSION:secret
};
function response(data,status=200){return new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}
});}
function fakeDb(){
  const rows=new Map(),queries=[];
  return {queries,rows,prepare(sql){
    queries.push(sql);
    assert.match(sql,/INSERT OR IGNORE INTO notification_events/);
    return {bind(...args){
      return {async run(){
        const key=args[1];
        if(!rows.has(key))rows.set(key,{key,topic:args[3],title:args[4],
          body:args[5],path:args[6]});
        return {meta:{changes:1}};
      }};
    }};
  }};
}

test('KST Friday 09:00 hour has an exact Saturday date; other days and hours are excluded',()=>{
  assert.equal(missionSaturdayNoticeWindow(day),'2026-11-07');
  for(const input of [
    '2026-11-05T00:15:00Z', // Thursday
    '2026-11-05T23:59:00Z', // Friday 08:59 KST
    '2026-11-06T01:00:00Z', // Friday 10:00 KST
    '2026-11-06T15:00:00Z', // Saturday 00:00 KST
    'invalid'
  ]) assert.equal(missionSaturdayNoticeWindow(input),null,input);
});
test('official one-off 2026-11-07 17:00 is reflected without fixed weekly 11:00 copy',()=>{
  const event=missionSaturdayNoticeEvent(meeting,{now:day});
  assert.equal(event.topic,'mission');
  assert.equal(event.serviceId,'mission');
  assert.equal(event.idempotencyKey,'mission:saturday:20261107:reminder');
  assert.equal(event.targetPath,'/ekodimission?meeting=2026-11-07#saturday');
  assert.match(event.body,/2026-11-07/);
  assert.match(event.body,/오후 5시/);
  assert.doesNotMatch(event.body,/오전 11시/);
  const earlier=missionSaturdayNoticeEvent({...meeting,time:'11:00'},{now:day});
  assert.equal(earlier.idempotencyKey,event.idempotencyKey,
    'one reminder per date, including rescheduled time');
});
test('cancellations, wrong dates, invalid venue/time, and absence of official status never publish',()=>{
  for(const altered of [
    {status:'cancelled'},{status:'completed'},{status:'draft'},
    {status:null},{date:'2026-11-14'},{date:'2026-11-06'},
    {time:'25:00'},{time:'11:99'},{time:''},{venue:''}
  ])assert.equal(missionSaturdayNoticeEvent({...meeting,...altered},{now:day}),null,JSON.stringify(altered));
});
test('default-off, topic-off, missing secret and wrong time avoid even fetching the board',async()=>{
  let calls=0;
  const transport=()=>{calls++;throw Error('should not fetch')};
  const cases=[
    [{},'disabled'],
    [{NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED:'true'},'publisher_not_ready'],
    [{...configured,NOTIFICATION_PUBLISH_MISSION_ENABLED:'false'},'publisher_not_ready'],
    [{...configured,NOTIFICATION_EVENT_SECRET_MISSION:''},'publisher_not_ready'],
  ];
  for(const [env,reason] of cases){
    assert.deepEqual(await runMissionSaturdayNotice(env,{now:day,transport}),{status:reason});
  }
  assert.deepEqual(await runMissionSaturdayNotice(configured,{now:new Date('2026-11-05T00:15:00Z'),transport}),{status:'outside_window'});
  assert.equal(calls,0);
});
test('public calendar response publishes only approved meeting summary, never attendee data',async()=>{
  const db=fakeDb();let reads=0;
  const transport=async url=>{
    reads++;assert.equal(url,'https://ekodi.kr/ekodimission/board/api/saturday');
    return response({ok:true,meeting,replies:[{
      displayName:'SECRET_ATTENDEE_NAME',body:'SECRET_PHONE_OR_PRIVATE_REPLY'
    }]});
  };
  const env={...configured,DB:db};
  const first=await runMissionSaturdayNotice(env,{now:day,transport});
  const second=await runMissionSaturdayNotice(env,{now:day,transport});
  assert.deepEqual(first,{status:'accepted',date:'2026-11-07'});
  assert.deepEqual(second,first);
  assert.equal(reads,2);
  assert.equal(db.rows.size,1,'database idempotency key must suppress cron repeats');
  const stored=[...db.rows.values()][0];
  assert.equal(stored.topic,'mission');
  assert.equal(stored.path,'/ekodimission?meeting=2026-11-07#saturday');
  assert.match(stored.body,/오후 5시/);
  assert.doesNotMatch(JSON.stringify(stored),/SECRET_ATTENDEE_NAME|SECRET_PHONE_OR_PRIVATE_REPLY/);
});
test('public calendar failure, stale meeting or cancellation fail closed and never enqueue',async()=>{
  const db=fakeDb(),env={...configured,DB:db};
  for(const transport of [
    async()=>response({ok:true,meeting:{...meeting,status:'cancelled'}}),
    async()=>response({ok:true,meeting:{...meeting,date:'2026-11-14'}}),
    async()=>response({ok:false,meeting}),
    async()=>response({ok:true,meeting},503),
    async()=>{throw Error('offline')}
  ]){
    const result=await runMissionSaturdayNotice(env,{now:day,transport});
    assert.notEqual(result.status,'accepted');
  }
  assert.equal(db.rows.size,0);
});
test('status does not claim delivery or send web push; event ingress return is observed',async()=>{
  const env={...configured,DB:fakeDb()};
  const transport=async()=>response({ok:true,meeting});
  const rejected=await runMissionSaturdayNotice(env,{now:day,transport,
    emit:async()=>new Response(null,{status:403})});
  assert.deepEqual(rejected,{status:'rejected',code:403});
});
