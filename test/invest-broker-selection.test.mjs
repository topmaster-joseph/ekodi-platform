import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';
import { investMyRoute } from '../invest-my-workspace.js';

const OWNER='topmaster.joseph@gmail.com';
const TOKEN='S'.repeat(43);
const sqlAutopilot=fs.readFileSync(new URL('../migrations/202610251300_invest_autopilot.sql',import.meta.url),'utf8');
const sqlStepUp=fs.readFileSync(new URL('../migrations/202610280100_invest_step_up.sql',import.meta.url),'utf8');

function db(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(sqlAutopilot);sqlite.exec(sqlStepUp);
 sqlite.prepare('INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)')
  .run(crypto.createHash('sha256').update(TOKEN).digest('hex'),OWNER,'2099-01-01T00:00:00.000Z','2026-11-03T00:00:00.000Z');
 const st=(sql,params=[])=>({
  bind(...values){return st(sql,values)},
  async first(){return sqlite.prepare(sql).get(...params)||null},
  async all(){return {results:sqlite.prepare(sql).all(...params)}},
  async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}}
 });
 return {sqlite,prepare:q=>st(q)};
}
function harness(email=OWNER){
 const database=db(),env={DB:database,ALLOW_MUTATIONS:'true',INVEST_OWNER_EMAIL:email,INVEST_STEP_UP_REQUIRED:'true',ALLOWED_ORIGINS:'https://ekodi.kr'};
 const call=async(method,path,data)=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({id:'verified-owner-uuid',email,email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200});
  try{
   const headers={authorization:'Bearer '+'a'.repeat(50),'x-ekodi-invest-step-up':TOKEN,origin:'https://ekodi.kr','content-type':'application/json'};
   const response=await handleInvestAutopilotApi(new Request('https://ekodi.kr'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
   return {status:response.status,body:await response.json()};
  }finally{globalThis.fetch=old}
 };
 return {database,env,call};
}

test('owner broker defaults to KIS, has exactly two selectable brokers, no connection or order grants',async()=>{
 const {call}=harness();
 const r=await call('GET','/v1/invest/autopilot/broker/selection');
 assert.equal(r.status,200);
 assert.equal(r.body.preferredBrokerId,'kis');
 assert.equal(r.body.defaultBrokerId,'kis');
 assert.deepEqual(r.body.availableBrokers.map(b=>b.id),['kis','toss']);
 for(const b of r.body.availableBrokers){
  assert.equal(b.liveTradingEnabled,false);
  assert.equal(b.connected,false);
  assert.equal(b.credentialsIncluded,false);
  assert.ok(b.docsUrl.startsWith('https://'));
 }
 assert.equal(r.body.connected,false);
 assert.equal(r.body.liveOrdersEnabled,false);
 assert.equal(r.body.brokerAuthorizationGranted,false);
});
test('owner selects Toss and back to KIS; preference persisted in existing audit event ledger without secrets',async()=>{
 const {database,call}=harness();
 const toss=await call('PUT','/v1/invest/autopilot/broker/selection',{brokerId:'toss'});
 assert.equal(toss.status,200);
 assert.equal(toss.body.preferredBrokerId,'toss');
 assert.equal(toss.body.ordersPlaced,0);
 assert.equal((await call('GET','/v1/invest/autopilot/broker/selection')).body.preferredBrokerId,'toss');
 assert.equal((await call('PUT','/v1/invest/autopilot/broker/selection',{brokerId:'toss'})).status,200);
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_autopilot_events WHERE event_type=?').get('broker:preference').n,1);
 assert.equal((await call('PUT','/v1/invest/autopilot/broker/selection',{brokerId:'kis'})).status,200);
 assert.equal((await call('GET','/v1/invest/autopilot/broker/selection')).body.preferredBrokerId,'kis');
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_autopilot_events WHERE event_type=?').get('broker:preference').n,2);
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_autopilot_orders').get().n,0);
 const logs=database.sqlite.prepare('SELECT payload_json FROM investment_autopilot_events WHERE event_type=?').all('broker:preference').map(row=>JSON.parse(row.payload_json));
 assert.deepEqual(logs,[{brokerId:'toss'},{brokerId:'kis'}]);
});
test('invalid broker ID, credential-bearing payload, unsupported method, nonowner and anonymous fail closed',async()=>{
 const {call,database}=harness();
 for(const payload of [{brokerId:'ibkr'},{brokerId:'unknown'},{brokerId:'toss',accessToken:'SECRET'},
  {brokerId:'toss',accountNumber:'123456'},{brokerId:'toss',secret:'redacted'},{brokerId:'__proto__'},
  {brokerId:null},{brokerId:1},[],null]){
  const result=await call('PUT','/v1/invest/autopilot/broker/selection',payload);
  assert.equal(result.status,400,JSON.stringify(payload));
  assert.equal(result.body.error,'BROKER_PREFERENCE_INVALID');
 }
 assert.equal((await call('DELETE','/v1/invest/autopilot/broker/selection')).status,405);
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_autopilot_events').get().n,0);
 const other=harness('someone@example.com');
 assert.equal((await other.call('GET','/v1/invest/autopilot/broker/selection')).status,403);
 const anonymous=await handleInvestAutopilotApi(new Request('https://ekodi.kr/v1/invest/autopilot/broker/selection'),{DB:db()});
 assert.equal(anonymous.status,401);
});
test('owner can change default broker but real-money orders remain HTTP 423',async()=>{
 const {call}=harness();
 await call('PUT','/v1/invest/autopilot/broker/selection',{brokerId:'toss'});
 const r=await call('POST','/v1/invest/autopilot/live/orders',{brokerId:'toss',symbol:'005930',side:'BUY',qty:100});
 assert.equal(r.status,423);assert.equal(r.body.error,'LIVE_EXECUTION_LOCKED');
 assert.equal(r.body.executionPerformed,false);
});
test('KIS is the first option in both owner selectors; browser synchronizes broker status',async()=>{
 const html=await (await investMyRoute(new Request('https://ekodi.kr/invest'),{})).text();
 assert.match(html,/id="brokerSelect"[^>]*><option value="kis">한국투자증권/);
 assert.match(html,/id="liveBroker"[^>]*><option value="kis">한국투자증권/);
 assert.match(html,/value="toss">토스증권/);
 assert.match(html,/id="preferredBrokerStatus"/);
 assert.match(html,/<section id="owner" hidden>/);
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 assert.match(js,/function syncBrokerSelectors/);
 assert.match(js,/async function loadBrokerSelection/);
 assert.match(js,/async function saveBrokerSelection/);
 assert.match(js,/\/broker\/selection/);
 assert.match(js,/loadBrokerSelection\(\)/);
 assert.match(js,/r\.data\.liveOrdersEnabled!==false/);
 assert.doesNotMatch(js,/sessionStorage\.setItem|localStorage\.setItem|\/live\/orders['"`]/);
});
