import test from 'node:test';
import assert from 'node:assert/strict';
import {investMyRoute} from '../invest-my-workspace.js';
import {
 emptyAutopilotPolicy,normalizeAutopilotPolicy,policyChangeRequiresReapproval,
 policyFingerprint,evaluateLiveActivation,AUTOPILOT_DEFAULT_STATE
} from '../invest-autopilot-core.js';

const values={totalBudget:2_000_000,maxOrderAmount:100_000,maxDailyBuyAmount:200_000,maxPositions:5,
 maxPositionWeightPct:20,minCashPct:20,dailyLossLimitPct:2,totalLossLimitPct:7,
 horizonYears:5,markets:['KR'],assetTypes:['ETF'],riskProfile:'balanced',
 tradingWindow:{start:'09:10',end:'15:10',tz:'Asia/Seoul'},
 maxTradesPerDay:4,alertChannels:['admin','email']};
const policy=normalizeAutopilotPolicy(values).policy;
const get=async path=>(await investMyRoute(new Request('https://ekodi.kr'+path),{})).text();

test('owner selects all money/loss limits; no presets can silently authorize live orders',()=>{
 assert.equal(AUTOPILOT_DEFAULT_STATE,'RESEARCH_ONLY');
 for(const key of ['totalBudget','maxOrderAmount','maxDailyBuyAmount','dailyLossLimitPct','totalLossLimitPct'])
  assert.equal(emptyAutopilotPolicy()[key],null);
 assert.equal(normalizeAutopilotPolicy(values).valid,true);
 assert.equal(evaluateLiveActivation({policy,envLiveApproved:true}).eligible,false);
});

test('any relaxation of the owner-defined investment envelope requires reapproval',()=>{
 const cases=[
  [{minCashPct:10},'cash_reserve_reduced'],
  [{maxTradesPerDay:5},'trade_frequency_increase'],
  [{horizonYears:6},'investment_horizon_extended'],
  [{tradingWindow:{...policy.tradingWindow,start:'08:50'}},'trading_window_expansion'],
  [{tradingWindow:{...policy.tradingWindow,end:'15:20'}},'trading_window_expansion'],
  [{tradingWindow:{...policy.tradingWindow,tz:'America/New_York'}},'trading_window_expansion'],
  [{alertChannels:['admin']},'alert_coverage_reduced'],
  [{totalBudget:2_500_000},'budget_increase'],
  [{maxOrderAmount:110_000},'order_limit_increase'],
  [{maxDailyBuyAmount:300_000},'order_limit_increase'],
  [{dailyLossLimitPct:3},'loss_limit_increase'],
  [{totalLossLimitPct:10},'loss_limit_increase'],
  [{markets:['KR','US']},'market_expansion']
 ];
 for(const [change,reason] of cases){
  const updated={...policy,...change};
  const verdict=policyChangeRequiresReapproval(policy,updated);
  assert.equal(verdict.required,true,reason);
  assert.ok(verdict.reasons.includes(reason),reason);
  assert.notEqual(policyFingerprint(policy),policyFingerprint(updated));
 }
});

test('narrower controls do not require increased investment authority',()=>{
 const narrowed={...policy,totalBudget:1_000_000,maxOrderAmount:50_000,maxDailyBuyAmount:100_000,
  minCashPct:30,maxTradesPerDay:2,horizonYears:4,dailyLossLimitPct:1,totalLossLimitPct:5,
  tradingWindow:{...policy.tradingWindow,start:'09:30',end:'14:30'}};
 assert.deepEqual(policyChangeRequiresReapproval(policy,narrowed),{required:false,reasons:[]});
 const extendedAlerts=policyChangeRequiresReapproval({...policy,alertChannels:['admin']},policy);
 assert.equal(extendedAlerts.required,false);
});

test('owner home is three clear actions with visible saved-policy placeholders but no hidden grants',async()=>{
 const html=await get('/invest/my');
 const start=html.indexOf('<section id="ownerOverview"');
 const end=html.indexOf('<section id="manualOrder"',start);
 assert.ok(start>0&&end>start);
 const home=html.slice(start,end);
 for(const label of ['1. 내 증권계좌','2. AI 투자 분석','3. 내 한도 안에서 자동운용'])
  assert.ok(home.includes(label),label);
 for(const href of ['/invest/my/broker','/invest/my/strategy','/invest/my/auto-policy'])
  assert.ok(home.includes('href="'+href+'"'),href);
 for(const id of ['mandateBudget','mandateOrder','mandateDailyBuy','mandateDailyLoss','mandateTotalLoss','mandateMode','mandateNotice'])
  assert.ok(home.includes('id="'+id+'"'),id);
 assert.match(home,/실계좌 자동주문은 별도 인증·검증·명시적 활성화 전까지 차단/);
 assert.match(html,/<section id="owner" hidden>/);
 assert.match(html,/<nav id="ownerSidebar"[^>]*hidden>/);
});

test('owner mandate summary renders actual saved limits and keeps trading locked without live authorization',async()=>{
 const js=await get('/invest/my/app.js');
 const css=await get('/invest/my/style.css');
 assert.match(js,/function renderOwnerMandate\(a\)/);
 assert.match(js,/renderOwnerMandate\(a\)/);
 assert.match(js,/setText\('mandateBudget',won\('totalBudget'\)\)/);
 assert.match(js,/setText\('mandateDailyLoss',pct\('dailyLossLimitPct'\)\)/);
 assert.match(js,/a\.execution\.liveOrders===true/);
 assert.match(js,/실계좌 자동주문은 비활성화 상태입니다/);
 assert.match(css,/\.mandate-cards\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:860px\)\{\.mandate-cards\{grid-template-columns:1fr\}/);
 assert.doesNotMatch(js,/\/broker\/orders|innerHTML/);
});
