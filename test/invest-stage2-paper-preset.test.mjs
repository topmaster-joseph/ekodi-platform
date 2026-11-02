import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {normalizeAutopilotPolicy,missingPolicyFields,evaluateAutopilotOrder} from '../invest-autopilot-core.js';
import {STAGE2_PAPER_PRESET_ID,STAGE2_PAPER_PRESET,STAGE2_PAPER_AUTOMATION,validatedStage2PaperPreset,stage2PaperPresetEligibility} from '../invest-stage2-paper-preset.js';
import {handleInvestAutopilotApi} from '../invest-autopilot-runtime.js';
import {investMyRoute} from '../invest-my-workspace.js';

const OWNER='topmaster.joseph@gmail.com',STEP='S'.repeat(43);
function db(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['202610251300_invest_autopilot.sql','202610280100_invest_step_up.sql'])
  sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)')
  .run(crypto.createHash('sha256').update(STEP).digest('hex'),OWNER,'2099-01-01T00:00:00.000Z','2026-11-01T00:00:00.000Z');
 const stmt=(sql,values=[])=>({bind(...args){return stmt(sql,args)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const x=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(x.changes)}}}});
 return{sqlite,prepare:sql=>stmt(sql)};
}
function harness(email=OWNER){
 const DB=db();
 const env={DB,INVEST_OWNER_EMAIL:email,INVEST_STEP_UP_REQUIRED:'true',ALLOW_MUTATIONS:'true',ALLOWED_ORIGINS:'https://ekodi.kr'};
 const call=async(method,path,payload)=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'verified-owner-uuid',email,email_confirmed_at:'2026-11-02T00:00:00Z'}),{status:200});
  try{
   const response=await handleInvestAutopilotApi(new Request('https://ekodi.kr'+path,{method,headers:{
    authorization:'Bearer '+'a'.repeat(50),'content-type':'application/json',origin:'https://ekodi.kr','x-ekodi-invest-step-up':STEP
   },body:payload===undefined?undefined:JSON.stringify(payload)}),env);
   return{status:response.status,body:await response.json()};
  }finally{globalThis.fetch=original}
 };
 return{DB,env,call};
}
const PATH='/v1/invest/autopilot/stage2/preset';

test('preset is complete, conservative, paper only and does not imply a live order',()=>{
 assert.equal(STAGE2_PAPER_PRESET_ID,'stage2-kr-etf-conservative-paper-v1');
 const {policy,valid}=normalizeAutopilotPolicy(STAGE2_PAPER_PRESET);
 assert.equal(valid,true);assert.deepEqual(missingPolicyFields(policy),[]);
 assert.deepEqual(validatedStage2PaperPreset(),policy);
 assert.equal(policy.totalBudget,1_000_000);
 assert.equal(policy.maxOrderAmount,50_000);
 assert.equal(policy.maxDailyBuyAmount,100_000);
 assert.equal(policy.minCashPct,30);
 assert.equal(policy.dailyLossLimitPct,1);
 assert.equal(policy.totalLossLimitPct,5);
 assert.equal(policy.maxTradesPerDay,2);
 assert.deepEqual(policy.markets,['KR']);
 assert.deepEqual(policy.assetTypes,['ETF']);
 assert.equal(policy.riskProfile,'conservative');
 assert.equal(STAGE2_PAPER_AUTOMATION.autoOrderSubmission,false);
 assert.equal(STAGE2_PAPER_AUTOMATION.autoRiskMonitoring,true);
 assert.equal(STAGE2_PAPER_AUTOMATION.liveOrdersEnabled,false);
 assert.equal(STAGE2_PAPER_AUTOMATION.brokerOrderPermission,false);
 assert.deepEqual(STAGE2_PAPER_AUTOMATION.approvedOrderTypes,['LIMIT']);
 assert.equal(stage2PaperPresetEligibility({state:'PAPER_TRADING',policy:{}}).eligible,false);
 assert.equal(stage2PaperPresetEligibility({state:'RESEARCH_ONLY',policy:{totalBudget:123}}).eligible,false);
});
test('owner preview is nonmutating and explicitly requires a separate application',async()=>{
 const {DB,call}=harness();
 const result=await call('GET',PATH);
 assert.equal(result.status,200);
 assert.equal(result.body.schema,'ekodi.invest.stage2-paper-preset.v1');
 assert.equal(result.body.eligibility.eligible,true);
 assert.equal(result.body.applicationRequiresOwnerAction,true);
 assert.equal(result.body.liveOrdersEnabled,false);
 assert.equal(result.body.automation.execution,'paper_only');
 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.body.policy.totalBudget,null);
 assert.equal(status.body.state,'RESEARCH_ONLY');
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_autopilot_orders').get().n,0);
});
test('explicit named-owner application saves paper policy atomically, never starts an order or live strategy',async()=>{
 const {DB,call}=harness();
 for(const payload of [undefined,{confirm:'LIVE_TRADING_APPROVED_BY_OWNER'},{confirm:'APPLY_STAGE2_PAPER_ONLY',brokerKey:'SECRET'}]){
  const r=await call('POST',PATH,payload);assert.equal(r.status,400);
 }
 const result=await call('POST',PATH,{confirm:'APPLY_STAGE2_PAPER_ONLY'});
 assert.equal(result.status,200);
 assert.equal(result.body.applied,true);
 assert.equal(result.body.paperTradingStarted,false);
 assert.equal(result.body.liveOrdersEnabled,false);
 assert.equal(result.body.state,'RESEARCH_ONLY');
 const status=await call('GET','/v1/invest/autopilot/status');
 assert.equal(status.body.policy.totalBudget,1_000_000);
 assert.equal(status.body.policy.riskProfile,'conservative');
 assert.equal(status.body.state,'RESEARCH_ONLY');
 assert.equal((await call('GET',PATH)).body.eligibility.reason,'EXISTING_POLICY_PRESERVED');
 assert.equal((await call('POST',PATH,{confirm:'APPLY_STAGE2_PAPER_ONLY'})).status,409);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM investment_autopilot_orders').get().n,0);
 assert.equal((await call('POST','/v1/invest/autopilot/live/orders',{symbol:'005930',side:'BUY',qty:10})).status,423);
 const audit=DB.sqlite.prepare('SELECT payload_json FROM investment_autopilot_events WHERE event_type=?').all('stage2:paper-preset');
 assert.equal(audit.length,1);assert.equal(JSON.parse(audit[0].payload_json).liveOrdersEnabled,false);
});
test('existing policy cannot be silently overwritten, live approval and nonresearch states block preset',async()=>{
 const {call,DB}=harness();
 await call('PUT','/v1/invest/autopilot/policy',{policy:STAGE2_PAPER_PRESET});
 assert.equal((await call('POST',PATH,{confirm:'APPLY_STAGE2_PAPER_ONLY'})).status,409);
 const x=DB.sqlite.prepare('SELECT policy_json FROM investment_autopilot_accounts').get();
 assert.equal(JSON.parse(x.policy_json).totalBudget,1_000_000);
});
test('unauthenticated, other-user, unsupported method are denied',async()=>{
 const other=harness('other@example.com');
 assert.equal((await other.call('GET',PATH)).status,403);
 assert.equal((await other.call('POST',PATH,{confirm:'APPLY_STAGE2_PAPER_ONLY'})).status,403);
 const anonymous=await handleInvestAutopilotApi(new Request('https://ekodi.kr'+PATH),{DB:db()});
 assert.equal(anonymous.status,401);
 const {call}=harness();
 assert.equal((await call('DELETE',PATH)).status,405);
});
test('owner UI puts paper-only presets under owner gate, with no autonomous live order submitter',async()=>{
 const html=await(await investMyRoute(new Request('https://ekodi.kr/invest'),{})).text();
 assert.match(html,/<section id="owner" hidden>/);
 assert.match(html,/id="apStage2Apply"[^>]*disabled/);
 assert.match(html,/id="apStage2Status"/);
 assert.match(html,/실제 주문 차단/);
 const js=await(await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 assert.match(js,/function applyStage2Preset/);
 assert.match(js,/async function loadStage2Preset/);
 assert.match(js,/\/stage2\/preset/);
 assert.match(js,/APPLY_STAGE2_PAPER_ONLY/);
 assert.doesNotMatch(js,/\/live\/orders['"`]/);
});
