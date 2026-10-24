import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { autopilotReportPeriods, periodPerformance } from '../invest-autopilot-core.js';
import { handleInvestAutopilotApi, runInvestAutopilotSchedule } from '../invest-autopilot-runtime.js';

const MIGRATION=fs.readFileSync(new URL('../migrations/202610251300_invest_autopilot.sql',import.meta.url),'utf8');
const LEGACY=fs.readFileSync(new URL('../migrations/0086_invest_autonomous_loop.sql',import.meta.url),'utf8');
const KST=h=>(y,m,d,hh=0,mm=0)=>Date.UTC(y,m-1,d,hh,mm)-9*3600e3;
const kst=KST();
const OWNER='owner@example.com';
const POLICY={totalBudget:10_000_000,maxOrderAmount:1_000_000,maxDailyBuyAmount:2_000_000,maxPositions:5,maxPositionWeightPct:20,minCashPct:10,
 dailyLossLimitPct:2,totalLossLimitPct:10,horizonYears:10,markets:['KR'],assetTypes:['ETF'],riskProfile:'balanced',
 tradingWindow:{start:'09:10',end:'15:10',tz:'Asia/Seoul'},maxTradesPerDay:5,alertChannels:['admin']};

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

async function seeded(extraEnv={},policy=POLICY){
 const env={DB:d1(),ALLOW_MUTATIONS:'true',ALLOWED_ORIGINS:'https://ekodi.kr',INVEST_OWNER_EMAIL:OWNER,...extraEnv};
 const call=async(method,path,payload)=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'owner-uuid',email:OWNER,email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200});
  try{
   const response=await handleInvestAutopilotApi(new Request('https://ekodi.kr'+path,{method,headers:{authorization:'Bearer '+'t'.repeat(40),'content-type':'application/json',origin:'https://ekodi.kr'},body:payload?JSON.stringify(payload):undefined}),env);
   return {status:response.status,body:await response.json()};
  }finally{globalThis.fetch=original}
 };
 assert.equal((await call('PUT','/v1/invest/autopilot/policy',{policy})).body.ok,true);
 assert.equal((await call('POST','/v1/invest/autopilot/state',{target:'PAPER_TRADING'})).body.state,'PAPER_TRADING');
 // Pin the paper start so period checks do not depend on the wall clock.
 env.DB.sqlite.prepare('UPDATE investment_autopilot_accounts SET paper_started_at=?').run(new Date(kst(2026,10,26,9,0)).toISOString());
 return {env,call};
}
const setLedger=(env,ledger)=>env.DB.sqlite.prepare('UPDATE investment_autopilot_accounts SET paper_ledger_json=?').run(JSON.stringify(ledger));
const notices=env=>env.DB.sqlite.prepare('SELECT kind,period_key,severity,delivery_status,delivery_detail FROM investment_autopilot_notices ORDER BY id').all();

test('report periods switch at Monday 08:00 KST and the 1st 08:00 KST',()=>{
 const [beforeWeek]=autopilotReportPeriods(kst(2026,11,2,7,59));
 const [atWeek]=autopilotReportPeriods(kst(2026,11,2,8,0));
 assert.equal(beforeWeek.key,'W:2026-10-19');
 assert.equal(atWeek.key,'W:2026-10-26');
 assert.equal(atWeek.start,kst(2026,10,26));
 assert.equal(atWeek.end,kst(2026,11,2));
 const [,monthBefore]=autopilotReportPeriods(kst(2026,11,1,7,0));
 const [,monthAt]=autopilotReportPeriods(kst(2026,11,1,8,0));
 assert.equal(monthBefore.key,'M:2026-09');
 assert.equal(monthAt.key,'M:2026-10');
 assert.equal(monthAt.start,kst(2026,10,1));
 assert.equal(monthAt.end,kst(2026,11,1));
 const [,january]=autopilotReportPeriods(kst(2027,1,1,9,0));
 assert.equal(january.key,'M:2026-12');
});

test('period performance uses the prior close as base and tracks drawdown',()=>{
 const perf=periodPerformance([{day:'a',equity:110},{day:'b',equity:99},{day:'c',equity:105}],100);
 assert.ok(Math.abs(perf.periodReturn-0.05)<1e-12);
 assert.ok(Math.abs(perf.maxDrawdown-0.1)<1e-12);
 assert.equal(periodPerformance([]).periodReturn,undefined);
});

test('scheduler skips accounts that have not started paper trading',async()=>{
 const env={DB:d1(),ALLOW_MUTATIONS:'true'};
 env.DB.sqlite.prepare(`INSERT INTO investment_autopilot_accounts(subject_type,subject_key,state,created_at,updated_at) VALUES('person','x','RESEARCH_ONLY','t','t')`).run();
 const result=await runInvestAutopilotSchedule(env,{now:kst(2026,11,2,9,0)});
 assert.equal(result.results[0].skipped,'paper_not_started');
 assert.equal(notices(env).length,0);
});

test('weekly report is generated once per period from daily equity and shown in status',async()=>{
 const {env,call}=await seeded();
 for(const [day,cash] of [[26,10_000_000],[27,10_050_000],[28,9_950_000],[30,10_100_000]]){
  setLedger(env,{cash,positions:[],startEquity:10_000_000,dayStartEquity:cash,dayKey:`2026-10-${day}`});
  await runInvestAutopilotSchedule(env,{now:kst(2026,10,day,15,0)});
 }
 assert.equal(notices(env).length,0);
 const first=await runInvestAutopilotSchedule(env,{now:kst(2026,11,2,8,5)});
 const again=await runInvestAutopilotSchedule(env,{now:kst(2026,11,2,8,15)});
 const weekly=notices(env).filter(n=>n.kind==='weekly');
 assert.equal(weekly.length,1);
 assert.equal(weekly[0].period_key,'W:2026-10-26');
 assert.equal(weekly[0].delivery_status,'in_app');
 assert.equal(weekly[0].delivery_detail,'email_not_selected');
 assert.equal(first.results[0].reports.filter(r=>r.issued).length,2);
 assert.equal(again.results[0].reports.length,0);
 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.body.latestReport.kind,'weekly');
 const lines=Object.fromEntries(status.body.latestReport.report.lines.map(l=>[l.label,l.value]));
 assert.equal(lines['주간 수익률'],'1.00%');
 assert.match(status.body.latestReport.report.disclaimer,/보장하지 않습니다/);
 // The October monthly report covers only the paper days that exist.
 assert.equal(notices(env).filter(n=>n.kind==='monthly')[0].period_key,'M:2026-10');
});

test('critical loss alert auto-pauses, is issued once per day and never liquidates',async()=>{
 const {env,call}=await seeded();
 const now=kst(2026,10,27,11,0);
 setLedger(env,{cash:9_750_000,positions:[{symbol:'069500',qty:1,avgCost:35000,price:35000}],startEquity:10_000_000,dayStartEquity:10_000_000,dayKey:'2026-10-27'});
 await runInvestAutopilotSchedule(env,{now});
 await runInvestAutopilotSchedule(env,{now:now+600_000});
 const alerts=notices(env).filter(n=>n.kind==='alert');
 assert.equal(alerts.length,1);
 assert.equal(alerts[0].period_key,'A:daily_loss_limit_reached:2026-10-27');
 assert.equal(alerts[0].severity,'critical');
 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.body.state,'PAUSED');
 assert.equal(status.body.paper.positions.length,1);
 assert.equal(status.body.alerts[0].title,'하루 손실 한도 도달 — 신규 주문 중지');
});

test('email delivery uses the existing messenger email channel only when selected and configured',async()=>{
 const sent=[];
 const CHANNEL_EMAIL={fetch:async(url,init)=>{sent.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'m-1'}),{status:200})}};
 const unconfigured=await seeded({},{...POLICY,alertChannels:['admin','email']});
 await runInvestAutopilotSchedule(unconfigured.env,{now:kst(2026,11,2,8,5)});
 assert.equal(notices(unconfigured.env)[0].delivery_detail,'email_channel_not_configured');
 const configured=await seeded({CHANNEL_EMAIL,INVEST_OWNER_MESSENGER_THREAD_ID:'42'},{...POLICY,alertChannels:['admin','email']});
 await runInvestAutopilotSchedule(configured.env,{now:kst(2026,11,2,8,5)});
 assert.equal(notices(configured.env).filter(n=>n.delivery_status==='delivered').length,2);
 assert.equal(sent[0].channel,'email');
 assert.equal(sent[0].threadId,42);
 assert.match(sent[0].body,/주간 운용 보고서/);
 assert.match(sent[0].body,/https:\/\/ekodi\.kr\/my\/invest/);
 assert.doesNotMatch(sent[0].body,/owner-uuid|access_token|client_secret/);
});

test('scheduler fails soft when the schema is not deployed yet',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 const DB={prepare:sql=>({bind:()=>({all:async()=>{sqlite.prepare(sql);return {results:[]}}})})};
 assert.deepEqual(await runInvestAutopilotSchedule({DB}),{ran:false,reason:'SCHEMA_NOT_READY'});
 assert.equal((await runInvestAutopilotSchedule({})).reason,'DATABASE_UNAVAILABLE');
});

test('the shared Control API cron runs the autopilot schedule without a new cron slot',()=>{
 const control=fs.readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
 assert.match(control,/runInvestAutopilotSchedule\(env, \{ now:scheduledAt\.getTime\(\) \}\)\.catch/);
 assert.match(control,/ctx\.waitUntil\(investAutopilot\)/);
 assert.doesNotMatch(fs.readFileSync(new URL('../wrangler.workspace-platform.toml',import.meta.url),'utf8'),/\[triggers\]/);
});
