import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import entryWorker from '../workspace-platform-entry-worker.js';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';

const MIGRATION=fs.readFileSync(new URL('../migrations/202610251300_invest_autopilot.sql',import.meta.url),'utf8');
const LEGACY=fs.readFileSync(new URL('../migrations/0086_invest_autonomous_loop.sql',import.meta.url),'utf8');
// 2026-10-26 (Mon) 10:00 KST, inside the configured trading window.
const MONDAY=Date.UTC(2026,9,26,1,0,0);
const OWNER='owner@example.com';

function d1(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(LEGACY);sqlite.exec(MIGRATION);
 const statement=(sql,params=[])=>({
  bind(...values){return statement(sql,values)},
  async first(){return sqlite.prepare(sql).get(...params)||null},
  async all(){return {results:sqlite.prepare(sql).all(...params)}},
  async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
 });
 return {sqlite,prepare:sql=>statement(sql)};
}

function harness(email=OWNER){
 const env={DB:d1(),ALLOW_MUTATIONS:'true',ALLOWED_ORIGINS:'https://ekodi.kr',INVEST_OWNER_EMAIL:OWNER};
 const call=async(method,path,payload)=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'owner-uuid',email,email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200});
  try{
   const response=await handleInvestAutopilotApi(new Request('https://workspace-api.ekodi.kr'+path,{method,headers:{authorization:'Bearer '+'t'.repeat(40),'content-type':'application/json',origin:'https://ekodi.kr'},body:payload?JSON.stringify(payload):undefined}),env);
   return {status:response.status,body:await response.json()};
  }finally{globalThis.fetch=original}
 };
 return {env,call};
}

const POLICY={totalBudget:10_000_000,maxOrderAmount:1_000_000,maxDailyBuyAmount:2_000_000,maxPositions:5,maxPositionWeightPct:20,minCashPct:10,
 dailyLossLimitPct:2,totalLossLimitPct:10,horizonYears:10,markets:['KR'],assetTypes:['ETF'],riskProfile:'balanced',
 tradingWindow:{start:'09:10',end:'15:10',tz:'Asia/Seoul'},maxTradesPerDay:5,alertChannels:['admin']};
const order=(over={})=>({idempotencyKey:'paper-20261026-0001',symbol:'069500',market:'KR',assetType:'ETF',side:'BUY',qty:10,limitPrice:35000,
 quote:{price:35000,prevClose:34900,at:new Date(MONDAY-2000).toISOString()},strategyId:'static_rebalance',rationale:'월간 리밸런싱',...over});

function withClock(fn){
 return async()=>{const realNow=Date.now;Date.now=()=>MONDAY;try{await fn()}finally{Date.now=realNow}};
}

test('autopilot API is owner-only and rejects anonymous callers',async()=>{
 const {call}=harness('someone@example.com');
 assert.equal((await call('GET','/v1/invest/autopilot/status')).body.error,'OWNER_ONLY');
 const anon=await handleInvestAutopilotApi(new Request('https://workspace-api.ekodi.kr/v1/invest/autopilot/status'),{DB:d1()});
 assert.equal(anon.status,401);
});

test('entry worker routes /v1/invest/autopilot to the autopilot runtime',async()=>{
 const {env}=harness();
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:401});
 try{
  const response=await entryWorker.fetch(new Request('https://workspace-api.ekodi.kr/v1/invest/autopilot/status',{headers:{authorization:'Bearer '+'t'.repeat(40)}}),env,{});
  assert.equal(response.status,401);
 }finally{globalThis.fetch=original}
});

test('new account starts in research only with every limit unset and live orders off',async()=>{
 const {call}=harness();
 const {status,body}=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status,200);
 assert.equal(body.state,'RESEARCH_ONLY');
 assert.equal(body.policy.totalBudget,null);
 assert.ok(body.policyMissing.includes('totalLossLimitPct'));
 assert.equal(body.execution.liveOrders,false);
 assert.equal(body.liveActivation.eligible,false);
 assert.equal(body.allocationExample.illustrativeOnly,true);
 assert.equal(body.broker.endpointsVerified,false);
 const keys=[];JSON.stringify(body,(k,v)=>{keys.push(k);return v});
 assert.equal(keys.some(k=>/account_?number|secret|access_?token|client_?id|credential(?!Mode)/i.test(k)),false);
});

test('paper trading cannot start until the policy is complete',async()=>{
 const {call}=harness();
 const blocked=await call('POST','/v1/invest/autopilot/state',{target:'PAPER_TRADING'});
 assert.equal(blocked.status,409);
 assert.equal(blocked.body.reason,'policy_incomplete');
 assert.equal((await call('PUT','/v1/invest/autopilot/policy',{policy:{...POLICY,leverage:true}})).body.error,'POLICY_INVALID');
 assert.equal((await call('PUT','/v1/invest/autopilot/policy',{policy:{...POLICY,alertChannels:['sms']}})).body.errors.alertChannels,'paid_channel_requires_cost_approval');
});

test('full paper loop: policy, start, risk-checked fills, duplicates, blocks, report, emergency stop',withClock(async()=>{
 const {env,call}=harness();
 assert.equal((await call('PUT','/v1/invest/autopilot/policy',{policy:POLICY})).body.ok,true);
 const start=await call('POST','/v1/invest/autopilot/state',{target:'PAPER_TRADING'});
 assert.equal(start.body.state,'PAPER_TRADING');

 const filled=await call('POST','/v1/invest/autopilot/paper/orders',order());
 assert.equal(filled.status,201);
 assert.equal(filled.body.order.status,'FILLED');
 assert.equal(filled.body.executionPerformed,false);
 assert.ok(filled.body.ledger.cash<10_000_000);

 const dup=await call('POST','/v1/invest/autopilot/paper/orders',order());
 assert.equal(dup.body.duplicate,true);
 assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM investment_autopilot_orders WHERE status='FILLED'").get().n,1);

 const tooBig=await call('POST','/v1/invest/autopilot/paper/orders',order({idempotencyKey:'paper-20261026-0002',qty:100}));
 assert.equal(tooBig.status,422);
 assert.ok(tooBig.body.reasons.includes('order_amount_limit'));
 const stale=await call('POST','/v1/invest/autopilot/paper/orders',order({idempotencyKey:'paper-20261026-0003',quote:{price:35000,at:new Date(MONDAY-600_000).toISOString()}}));
 assert.ok(stale.body.reasons.includes('market_data_stale'));
 const lev=await call('POST','/v1/invest/autopilot/paper/orders',order({idempotencyKey:'paper-20261026-0004',leverage:2}));
 assert.ok(lev.body.reasons.includes('leverage_or_derivative_blocked'));
 const us=await call('POST','/v1/invest/autopilot/paper/orders',order({idempotencyKey:'paper-20261026-0005',market:'US'}));
 assert.ok(us.body.reasons.includes('market_not_allowed'));

 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.body.paper.positions[0].symbol,'069500');
 assert.equal(status.body.paper.dataBasis,'paper_owner_supplied_quotes');
 assert.ok(status.body.paper.validation.failures.includes('paper_period_insufficient'));
 assert.ok(status.body.liveActivation.blockers.includes('platformLiveSwitch'));

 const weekly=await call('GET','/v1/invest/autopilot/report?kind=weekly');
 assert.equal(weekly.body.kind,'weekly');
 assert.equal(weekly.body.lines.find(l=>l.label==='이번 주 거래').value,'1건');

 // Live is unreachable: paper validation and governed gates are not satisfied.
 assert.equal((await call('POST','/v1/invest/autopilot/state',{target:'LIVE_PENDING_APPROVAL'})).body.reason,'paper_validation_required');
 assert.equal((await call('POST','/v1/invest/autopilot/state',{target:'LIVE_ACTIVE'})).status,409);

 const stop=await call('POST','/v1/invest/autopilot/emergency-stop');
 assert.equal(stop.body.state,'EMERGENCY_STOPPED');
 assert.equal(stop.body.holdingsLiquidated,false);
 const afterStop=await call('POST','/v1/invest/autopilot/paper/orders',order({idempotencyKey:'paper-20261026-0006'}));
 assert.ok(afterStop.body.reasons.includes('state_not_trading'));
 // Holdings and reports remain readable while stopped.
 const stopped=await call('GET','/v1/invest/autopilot/status');
 assert.equal(stopped.body.paper.positions.length,1);
 assert.equal((await call('POST','/v1/invest/autopilot/state',{target:'PAPER_TRADING'})).body.error,'RESUME_CONFIRMATION_REQUIRED');
 assert.equal((await call('POST','/v1/invest/autopilot/state',{target:'PAPER_TRADING',confirm:'RESUME_AFTER_REVIEW'})).body.state,'PAPER_TRADING');
 const events=env.DB.sqlite.prepare('SELECT event_type FROM investment_autopilot_events').all().map(r=>r.event_type);
 assert.ok(events.includes('emergency_stop'));
 assert.ok(events.includes('risk:blocked'));
}));

test('sentinel auto-pauses paper trading when the daily loss limit is reached',withClock(async()=>{
 const {env,call}=harness();
 await call('PUT','/v1/invest/autopilot/policy',{policy:POLICY});
 await call('POST','/v1/invest/autopilot/state',{target:'PAPER_TRADING'});
 const day=new Date(MONDAY+9*3600e3).toISOString().slice(0,10);
 env.DB.sqlite.prepare('UPDATE investment_autopilot_accounts SET paper_ledger_json=?').run(JSON.stringify({cash:9_700_000,positions:[],startEquity:10_000_000,dayStartEquity:10_000_000,dayKey:day}));
 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.body.state,'PAUSED');
 assert.equal(status.body.sentinel.liquidateHoldings,false);
 assert.ok(status.body.sentinel.alerts.some(a=>a.code==='daily_loss_limit_reached'));
}));

test('migration is additive and stores no credentials',()=>{
 assert.doesNotMatch(MIGRATION,/\bDROP\b|\bRENAME\b/i);
 const ddl=MIGRATION.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(ddl,/password|secret|token|account_number|client_id/i);
});
