import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleNotificationAdminSummary} from '../notification-admin-summary.js';

function fixture(role='super_admin'){
  const raw=new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=ON');
  raw.exec(readFileSync(new URL('../migrations/202611020100_notification_core.sql',import.meta.url),'utf8'));
  raw.exec("CREATE TABLE admins (id TEXT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL);"+
    "CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL,expires_at TEXT NOT NULL);"+
    "CREATE TABLE admin_privileged_sessions (token_hash TEXT,expires_at TEXT)");
  raw.prepare('INSERT INTO admins VALUES(?,?,?)').run('a','admin@example.test',role);
  const db={prepare(query){return {bind(...args){const stmt=raw.prepare(query);return {
    async first(){return stmt.get(...args)||null},
    async all(){return {results:stmt.all(...args)}},
    async run(){const info=stmt.run(...args);return {meta:{changes:info.changes}}}
  }}}}};
  const token='x'.repeat(50);
  return {raw,db,token,async authorize(){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const hash=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
    raw.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash,'a','2099-01-01T00:00:00.000Z');
  }};
}
const request=(token,topic='all')=>new Request('https://ekodi.kr/api/notifications/admin/summary?topic='+topic,
  {headers:token?{authorization:'Bearer '+token}:{}});
test('summary is private and rejects no session, expired or non-super roles',async()=>{
  const f=fixture();await f.authorize();
  assert.equal((await handleNotificationAdminSummary(request(''),{DB:f.db})).status,403);
  assert.equal((await handleNotificationAdminSummary(request('w'.repeat(50)),{DB:f.db})).status,403);
  const tenant=fixture('site_admin');await tenant.authorize();
  assert.equal((await handleNotificationAdminSummary(request(tenant.token),{DB:tenant.db})).status,403);
  assert.equal((await handleNotificationAdminSummary(request(f.token,'invalid'),{DB:f.db})).status,400);
});
test('summary aggregates per-topic data without exposing endpoint, token or private keys',async()=>{
  const f=fixture();await f.authorize();
  f.raw.prepare('INSERT INTO notification_devices VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    'd1','private-token-hash','inbox:private-token-hash','','','["mission"]','2026-11',
    '2026-11-02T01:00:00Z','2026-11-02T01:00:00Z','2026-11-02T01:00:00Z',null
  );
  f.raw.prepare('INSERT INTO notification_events (id,idempotency_key,service_id,topic,title,body,target_path,scheduled_at,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    'e1','mission:published:20261102','mission','mission','Private title','Private body','/ekodimission/',
    '2026-11-02T01:00:00Z','2026-11-02T01:00:00Z','done'
  );
  f.raw.prepare('INSERT INTO notification_deliveries (event_id,device_id,status,next_attempt_at) VALUES(?,?,?,?)').run(
    'e1','d1','delivered','2026-11-02T01:00:00Z'
  );
  const result=await handleNotificationAdminSummary(request(f.token,'mission'),{DB:f.db});
  assert.equal(result.status,200);
  const json=await result.json();
  assert.equal(json.ok,true);assert.equal(json.topics.length,1);
  assert.equal(json.topics[0].subscriberDevices,1);
  assert.equal(json.topics[0].events,1);
  assert.equal(json.topics[0].delivered,1);
  assert.equal(json.webPushEnabled,false);
  const output=JSON.stringify(json);
  for(const secret of ['private-token-hash','Private body','Private title','/ekodimission/'])assert.equal(output.includes(secret),false);
  assert.equal(result.headers.get('cache-control'),'no-store');
});
test('no admin summary can be used to mutate event/subscriber data',async()=>{
  const f=fixture();await f.authorize();
  const url='https://ekodi.kr/api/notifications/admin/summary';
  assert.equal((await handleNotificationAdminSummary(new Request(url,{method:'POST',headers:{authorization:'Bearer '+f.token}}),{DB:f.db})).status,405);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM notification_devices').get().n,0);
});

test('period windows isolate historical events while subscriber count remains current',async()=>{
  const f=fixture();await f.authorize();
  const now=new Date('2026-11-03T12:00:00.000Z');
  f.raw.prepare('INSERT INTO notification_devices VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    'device-1','private-device-token','inbox:private-device-token','','','["mission"]','2026-11',
    '2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','2026-11-03T01:00:00Z',null);
  const addEvent=f.raw.prepare('INSERT INTO notification_events (id,idempotency_key,service_id,topic,title,body,target_path,scheduled_at,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?)');
  addEvent.run('old','mission:event:20261001','mission','mission','Private old title','Private old message','/ekodimission/',
    '2026-10-01T12:00:00Z','2026-10-01T12:00:00Z','done');
  addEvent.run('recent','mission:event:20261102','mission','mission','Private new title','Private new message','/ekodimission/',
    '2026-11-02T12:00:00Z','2026-11-02T12:00:00Z','pending');
  const addDelivery=f.raw.prepare('INSERT INTO notification_deliveries (event_id,device_id,status,next_attempt_at,delivered_at) VALUES(?,?,?,?,?)');
  addDelivery.run('old','device-1','delivered','2026-10-01T12:00:00Z','2026-10-01T12:02:00Z');
  addDelivery.run('recent','device-1','pending','2026-11-02T12:01:00Z',null);
  const query=async window=>{
    const u=new URL('https://ekodi.kr/api/notifications/admin/summary?topic=mission');
    u.searchParams.set('window',window);
    const r=await handleNotificationAdminSummary(new Request(u,{headers:{authorization:'Bearer '+f.token}}),{DB:f.db},{now});
    return {status:r.status,body:await r.json(),headers:r.headers};
  };
  const last7=await query('7d');
  assert.equal(last7.status,200);
  assert.equal(last7.body.window,'7d');
  assert.equal(last7.body.subscriberCountScope,'current_active_devices');
  assert.equal(last7.body.topics[0].subscriberDevices,1);
  assert.equal(last7.body.topics[0].events,1);
  assert.equal(last7.body.topics[0].deliveries,1);
  assert.equal(last7.body.topics[0].pending,1);
  assert.equal(last7.body.topics[0].stalled,1);
  assert.equal(last7.body.topics[0].eventsOverdue,1);
  assert.equal(last7.body.topics[0].lastEventAt,'2026-11-02T12:00:00Z');
  assert.equal(last7.body.topics[0].lastDeliveredAt,null);
  const all=await query('all');
  assert.equal(all.body.cutoff,null);
  assert.equal(all.body.topics[0].subscriberDevices,1);
  assert.equal(all.body.topics[0].events,2);
  assert.equal(all.body.topics[0].delivered,1);
  assert.equal(all.body.topics[0].stalled,1);
  assert.equal(all.headers.get('cache-control'),'no-store');
  const thirty=await query('30d');
  assert.equal(thirty.body.topics[0].events,1);
  const invalid=await query('365d');
  assert.equal(invalid.status,400);
  assert.equal(invalid.body.error,'invalid_window');
  for(const secret of ['private-device-token','Private old title','Private new message']){
    assert.equal(JSON.stringify(all.body).includes(secret),false);
  }
});
