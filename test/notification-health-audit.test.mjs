import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runNotificationHealthAudit,notificationHealthState,NOTIFICATION_HEALTH_SQL} from '../notification-health-audit.js';

function fixture(){
  const raw=new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=ON');
  raw.exec(readFileSync(new URL('../migrations/202611020100_notification_core.sql',import.meta.url),'utf8'));
  const db={prepare(sql){
    return{run:async()=>{raw.exec(sql);return {meta:{changes:0}}},
      bind(...args){const stmt=raw.prepare(sql);return{
        first:async()=>stmt.get(...args)||null,
        all:async()=>({results:stmt.all(...args)}),
        run:async()=>{const r=stmt.run(...args);return{meta:{changes:r.changes}}}
      }}};
  }};
  return {raw,db};
}
const clock=(minute)=>new Date('2026-11-21T00:'+String(minute).padStart(2,'0')+':00.000Z');
const env=db=>({DB:db,NOTIFICATION_PUBLISH_CHURCH_ENABLED:'true',
  NOTIFICATION_EVENT_SECRET_CHURCH:'x'.repeat(40),
  NOTIFICATIONS_SEND_ENABLED:'true',
  NOTIFICATION_VAPID_PUBLIC_KEY:'public-key',NOTIFICATION_VAPID_PRIVATE_JWK:'private-key'});

test('states preserve outage-vs-no-traffic-vs-channel-paused distinction',()=>{
  assert.equal(notificationHealthState({publisherReady:true,sendEnabled:true,subscribers:1,events:1,failed:1}),'attention');
  assert.equal(notificationHealthState({publisherReady:false,sendEnabled:true,subscribers:0,events:0}),'configuration_required');
  assert.equal(notificationHealthState({publisherReady:true,sendEnabled:true,subscribers:0,events:0}),'unverified');
  assert.equal(notificationHealthState({publisherReady:true,sendEnabled:false,subscribers:1,events:1}),'push_paused');
  assert.equal(notificationHealthState({publisherReady:true,sendEnabled:true,subscribers:1,events:1}),'queue_clear');
  assert.equal(notificationHealthState({publisherReady:true,sendEnabled:true,subscribers:1,events:0}),'unverified');
});

test('scheduled audit records timestamps and transitions without subscriber identifiers',async()=>{
  const f=fixture();
  assert.match(NOTIFICATION_HEALTH_SQL,/PRIMARY KEY/);
  f.raw.prepare('INSERT INTO notification_devices VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    'd1','private_hash','inbox:private_hash','','','["church"]','2026-11',
    '2026-11-21T00:00:00Z','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z',null
  );
  f.raw.prepare('INSERT INTO notification_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    'e1','church:one','church','church','Secret title','Secret body','/ekodichurch',
    '2026-11-21T00:25:00Z','2026-11-21T00:21:00Z','pending'
  );
  const runtime=env(f.db);
  let report=await runNotificationHealthAudit(runtime,{now:clock(30),topics:['church','church','untrusted']});
  assert.equal(report.ok,true);
  assert.equal(report.topicCount,1);
  let row=f.raw.prepare('SELECT * FROM notification_health_snapshots WHERE topic=?').get('church');
  assert.equal(row.state,'queue_clear');assert.equal(row.subscriber_devices,1);
  assert.equal(row.events_24h,1);assert.equal(row.consecutive_attention,0);
  assert.equal(row.checked_at,'2026-11-21T00:30:00.000Z');
  f.raw.prepare("UPDATE notification_events SET scheduled_at='2026-11-20T23:30:00Z' WHERE id='e1'").run();
  report=await runNotificationHealthAudit(runtime,{now:clock(40),topics:['church']});
  assert.equal(report.attention,1);
  row=f.raw.prepare('SELECT * FROM notification_health_snapshots WHERE topic=?').get('church');
  assert.equal(row.state,'attention');assert.equal(row.events_overdue,1);
  assert.equal(row.consecutive_attention,1);
  const changedAt=row.changed_at;
  await runNotificationHealthAudit(runtime,{now:clock(41),topics:['church']});
  row=f.raw.prepare('SELECT * FROM notification_health_snapshots WHERE topic=?').get('church');
  assert.equal(row.consecutive_attention,2);assert.equal(row.changed_at,changedAt);
  f.raw.prepare("UPDATE notification_events SET status='done' WHERE id='e1'").run();
  await runNotificationHealthAudit(runtime,{now:clock(42),topics:['church']});
  row=f.raw.prepare('SELECT * FROM notification_health_snapshots WHERE topic=?').get('church');
  assert.equal(row.state,'queue_clear');assert.equal(row.consecutive_attention,0);
  assert.notEqual(row.changed_at,changedAt);
  const snapshot=JSON.stringify(f.raw.prepare('SELECT * FROM notification_health_snapshots').all());
  assert.doesNotMatch(snapshot,/private_hash|Secret body|Secret title/);
});

test('queue failures, stale locks and explicit publishing gates are actionable',async()=>{
  const f=fixture();const runtime=env(f.db);
  f.raw.prepare('INSERT INTO notification_devices VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    'd1','private_hash','inbox:private_hash','','','["church"]','2026-11',
    '2026-11-21T00:00:00Z','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z',null);
  f.raw.prepare('INSERT INTO notification_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    'e1','church:failed','church','church','Secret title','Secret body','/ekodichurch',
    '2026-11-21T00:01:00Z','2026-11-21T00:01:00Z','fanout');
  f.raw.prepare('INSERT INTO notification_deliveries(event_id,device_id,status,next_attempt_at) VALUES(?,?,?,?)')
    .run('e1','d1','failed','2026-11-21T00:01:00Z');
  await runNotificationHealthAudit(runtime,{now:clock(30),topics:['church','mission']});
  let rows=f.raw.prepare('SELECT topic,state,failed_24h,consecutive_attention FROM notification_health_snapshots ORDER BY topic').all();
  assert.deepEqual(rows.map(r=>[r.topic,r.state]),[['church','attention'],['mission','configuration_required']]);
  assert.equal(rows[0].failed_24h,1);
  f.raw.prepare("UPDATE notification_deliveries SET status='processing',locked_at='2026-11-21T00:01:00Z'").run();
  await runNotificationHealthAudit(runtime,{now:clock(40),topics:['church']});
  rows=f.raw.prepare('SELECT topic,state,stalled FROM notification_health_snapshots WHERE topic=?').all('church');
  assert.equal(rows[0].stalled,1);
});

test('missing store and invalid time fail closed with no network side effect',async()=>{
  assert.deepEqual(await runNotificationHealthAudit({}),{ok:false,code:'DB_UNAVAILABLE'});
  const f=fixture();
  assert.deepEqual(await runNotificationHealthAudit({DB:f.db},{now:'not-date'}),{ok:false,code:'INVALID_TIME'});
  assert.equal(f.raw.prepare("SELECT name FROM sqlite_master WHERE name='notification_health_snapshots'").get(),undefined);
});
