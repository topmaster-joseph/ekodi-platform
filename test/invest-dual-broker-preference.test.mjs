import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleInvestAutopilotApi} from '../invest-autopilot-runtime.js';

const OWNER='topmaster.joseph@gmail.com';
const TOKEN='S'.repeat(43);
const migrations=[
 '../migrations/0086_invest_autonomous_loop.sql',
 '../migrations/202610251300_invest_autopilot.sql',
 '../migrations/202610280100_invest_step_up.sql'
];
function fixture(email=OWNER,configuredOwner=OWNER) {
 const sqlite=new DatabaseSync(':memory:');
 for(const migration of migrations)sqlite.exec(fs.readFileSync(new URL(migration,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES (?,?,?,?)')
  .run(crypto.createHash('sha256').update(TOKEN).digest('hex'),email,'2099-01-01T00:00:00.000Z','2026-11-01T00:00:00.000Z');
 const statement=(sql,params=[])=>({bind(...values){return statement(sql,values)},async first(){return sqlite.prepare(sql).get(...params)||null},
  async all(){return{results:sqlite.prepare(sql).all(...params)}},
  async run(){const r=sqlite.prepare(sql).run(...params);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}});
 const env={DB:{prepare:sql=>statement(sql)},ALLOW_MUTATIONS:'true',ALLOWED_ORIGINS:'https://ekodi.kr',INVEST_OWNER_EMAIL:configuredOwner,INVEST_STEP_UP_REQUIRED:'true'};
 const call=async(method='GET',payload=null)=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'owner-uuid',email,email_confirmed_at:'2026-11-01T00:00:00Z'}),{status:200});
  try {
   const response=await handleInvestAutopilotApi(new Request('https://ekodi.kr/v1/invest/autopilot/broker/selection',{
    method,headers:{authorization:'Bearer '+'t'.repeat(40),'content-type':'application/json','x-ekodi-invest-step-up':TOKEN,origin:'https://ekodi.kr'},
    body:payload===null?undefined:JSON.stringify(payload)
   }),env);
   return{status:response.status,data:await response.json()};
  }finally{globalThis.fetch=original}
 };
 return{call,sqlite,env};
}
test('named owner sees KIS as default and Toss alternative, no live order permission',async()=>{
 const {call}=fixture();
 const {status,data}=await call();
 assert.equal(status,200);
 assert.equal(data.schema,'ekodi.invest.owner-broker-selection.v1');
 assert.equal(data.defaultBrokerId,'kis');
 assert.equal(data.preferredBrokerId,'kis');
 assert.deepEqual(data.availableBrokers.map(b=>b.id),['kis','toss']);
 assert.deepEqual(data.availableBrokers.find(b=>b.id==='kis').environments,['paper','live']);
 assert.deepEqual(data.availableBrokers.find(b=>b.id==='toss').environments,['live']);
 assert.ok(data.availableBrokers.every(b=>b.accountConnection==='not_connected'&&b.orderPermission==='blocked'));
 assert.equal(data.selectionOnly,true);
 assert.equal(data.connected,false);
 assert.equal(data.brokerAuthorizationGranted,false);
 assert.equal(data.liveOrdersEnabled,false);
 assert.ok(data.availableBrokers.every(b=>b.liveTradingEnabled===false&&b.credentialsIncluded===false&&b.connected===false));
});
test('owner can save Toss and switch back to KIS persistently without permission change',async()=>{
 const {call,sqlite}=fixture();
 assert.equal((await call('PUT',{brokerId:'toss'})).data.preferredBrokerId,'toss');
 assert.equal((await call()).data.preferredBrokerId,'toss');
 assert.equal((await call('PUT',{brokerId:'toss'})).status,200);
 assert.equal((await call('PUT',{brokerId:'kis'})).data.preferredBrokerId,'kis');
 assert.equal((await call()).data.preferredBrokerId,'kis');
 const count=sqlite.prepare("SELECT count(*) as total FROM investment_autopilot_events WHERE event_type='broker:preference'").get().total;
 assert.equal(count,2);
 assert.equal((await call()).data.liveOrdersEnabled,false);
});
test('invalid broker, unknown fields, and attempts to activate live trading fail closed',async()=>{
 const {call}=fixture();
 for(const data of [
  {brokerId:'ibkr'}, {brokerId:'nope'}, {brokerId:'toss',liveOrdersEnabled:true},
  {brokerId:'kis',accountNumber:'123'}, {brokerId:'kis',environment:'live'},
  {brokerId:'toss',credentials:{secret:'abc'}}, {brokerId:1}, {}
 ]) {
  const r=await call('PUT',data);
  assert.equal(r.status,400,JSON.stringify(data));
  assert.equal(r.data.error,'BROKER_PREFERENCE_INVALID');
 }
 assert.equal((await call()).data.preferredBrokerId,'kis');
});
test('non-owner cannot read or change broker preference; anonymous cannot access',async()=>{
 const other=fixture('other@example.com');
 const blocked=await other.call('GET');
 assert.equal(blocked.status,403);
 assert.equal((await other.call('PUT',{brokerId:'toss'})).status,403);
 const anon=await handleInvestAutopilotApi(new Request('https://ekodi.kr/v1/invest/autopilot/broker/selection'),other.env);
 assert.equal(anon.status,401);
});

test('broker preference respects only a verified configured owner without widening live-order authority',async()=>{
 const configured='joseph@ekodi.kr';
 const owner=fixture(configured,configured);
 const initial=await owner.call('GET');
 assert.equal(initial.status,200);
 assert.equal(initial.data.preferredBrokerId,'kis');
 assert.equal((await owner.call('PUT',{brokerId:'toss'})).status,200);
 assert.equal((await owner.call('GET')).data.preferredBrokerId,'toss');
 assert.equal((await owner.call('PUT',{brokerId:'kis'})).data.liveOrdersEnabled,false);
 const wrong=fixture('other@example.com',configured);
 assert.equal((await wrong.call('GET')).status,403);
 assert.equal((await wrong.call('PUT',{brokerId:'toss'})).status,403);
});
