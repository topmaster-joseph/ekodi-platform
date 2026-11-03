import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleNotificationAdminSummary} from '../notification-admin-summary.js';
import {notificationAdminAuthority} from '../notification-admin-authority.js';

const jwt=['a'.repeat(12),'b'.repeat(12),'c'.repeat(12)].join('.');
const req=(topic='all',token=jwt)=>new Request(
  'https://ekodi.kr/api/notifications/admin/summary?topic='+topic,
  {headers:{authorization:'Bearer '+token}}
);
function db(){
  const raw=new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=ON');
  raw.exec(readFileSync(new URL('../migrations/202611020100_notification_core.sql',import.meta.url),'utf8'));
  raw.exec("CREATE TABLE admins(id TEXT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL);"+
    "CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL,expires_at TEXT NOT NULL);"+
    "CREATE TABLE admin_privileged_sessions(token_hash TEXT,expires_at TEXT)");
  const DB={prepare(sql){return {bind(...args){const stmt=raw.prepare(sql);
    return {async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},
      async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}}}}}}}};
  return {raw,DB};
}
function provider({role='tenant_admin',tenant='ekodimission',tenantId='w1',confirmed=true,
  userOk=true,contextsOk=true,secretToken=jwt}={}){
  const seen=[];
  const transport=async(url,init)=>{
    seen.push({url,auth:init.headers.authorization,apiKey:init.headers.apikey});
    assert.equal(init.headers.authorization,'Bearer '+secretToken);
    assert.equal(init.headers.apikey,'safe-publishable-test-key');
    if(url.endsWith('/auth/v1/user'))
      return new Response(JSON.stringify({id:userOk?'verified-user':null,email:'admin@example.test',
        email_confirmed_at:confirmed?'2026-11-01T01:00:00Z':null}),{status:userOk?200:401});
    return new Response(JSON.stringify([{tenant_id:tenantId,tenant,authorization_role:role}]),{status:contextsOk?200:401});
  };
  return {transport,seen};
}
const envFor=DB=>({DB,MY_SUPABASE_URL:'https://example.supabase.co',MY_SUPABASE_PUBLISHABLE_KEY:'safe-publishable-test-key'});
test('verified mission site admin receives ONLY mission aggregated metrics; all is scoped',async()=>{
  const {DB}=db(),env=envFor(DB),{transport,seen}=provider();
  const res=await handleNotificationAdminSummary(req(),env,{transport});
  assert.equal(res.status,200);
  const summary=await res.json();
  assert.equal(summary.scope,'authorized_sites');
  assert.deepEqual(summary.topics.map(x=>x.id),['mission']);
  assert.equal(summary.topics[0].subscriberDevices,0);
  assert.equal(summary.deviceDetailsExposed,false);
  assert.equal(seen.length,2);
  assert.equal((await handleNotificationAdminSummary(req('church'),env,{transport})).status,403);
  assert.equal((await handleNotificationAdminSummary(req('seonammedi'),env,{transport})).status,403);
  const mission=await handleNotificationAdminSummary(req('mission'),env,{transport});
  assert.equal(mission.status,200);
});
test('verified church leadership can see church, never mission',async()=>{
  const {DB}=db(),env=envFor(DB),{transport}=provider({
    role:'senior_pastor',tenant:'ekodi-church'});
  const scoped=await handleNotificationAdminSummary(req(),env,{transport});
  assert.deepEqual((await scoped.json()).topics.map(t=>t.id),['church']);
  assert.equal((await handleNotificationAdminSummary(req('mission'),env,{transport})).status,403);
});
test('viewer, unknown site, unconfirmed user, absent tenant id and failed auth all fail closed',async()=>{
  const {DB}=db(),env=envFor(DB);
  for(const overrides of [
    {role:'viewer'},{role:'client_viewer'},{tenant:'unmapped-shop'},
    {tenantId:''},{confirmed:false},{userOk:false},{contextsOk:false}
  ]){
    const {transport}=provider(overrides);
    assert.equal((await handleNotificationAdminSummary(req(),env,{transport})).status,403,
      JSON.stringify(overrides));
  }
});
test('a syntactically JWT-looking value cannot grant rights without server validation',async()=>{
  const {DB}=db(),env=envFor(DB),transport=async()=>{throw Error('network_unavailable')};
  assert.equal(await notificationAdminAuthority(req(),env,{transport}),null);
  assert.equal((await handleNotificationAdminSummary(req(),env,{transport})).status,403);
  assert.equal((await handleNotificationAdminSummary(req('all','not-a-jwt'),env,{transport})).status,403);
});
test('single token with contexts for two approved sites can aggregate only those two',async()=>{
  const {DB}=db(),env=envFor(DB);
  const {transport:ordinary}=provider();
  const transport=async(url,opts)=>{
    if(url.endsWith('/auth/v1/user'))return ordinary(url,opts);
    return Response.json([
      {tenant_id:'w1',tenant:'ekodi-church',authorization_role:'tenant_admin'},
      {tenant_id:'w2',tenant:'ekodimission',authorization_role:'tenant_admin'},
      {tenant_id:'w3',tenant:'other-company',authorization_role:'tenant_admin'},
    ]);
  };
  const res=await handleNotificationAdminSummary(req(),env,{transport});
  assert.deepEqual((await res.json()).topics.map(x=>x.id),['church','mission']);
});
