import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVEST_PERMISSION,BROKER_ADAPTERS,INVEST_MARKET_POLICY,AI_CIO_POLICY,
  aggregatePortfolio,evaluateInvestmentOrder,
  investmentCommitteeDecision,aiCioDecision,createInvestmentAuditEvent
} from '../invest-market-core.js';

test('market layer is simulation-first and live trading is disabled by default',()=>{
  assert.equal(INVEST_MARKET_POLICY.canonicalPath,'/invest');
  assert.equal(INVEST_MARKET_POLICY.defaultMode,'simulation');
  assert.equal(INVEST_MARKET_POLICY.autonomousLiveTrading,false);
  assert.equal(BROKER_ADAPTERS.toss.liveTradingEnabled,false);
  assert.equal(BROKER_ADAPTERS.ibkr.liveTradingEnabled,false);
});

test('simulation may pass without broker credentials',()=>{
  const result=evaluateInvestmentOrder({mode:'simulation'});
  assert.equal(result.allowed,true);
});

test('live order is blocked until approval broker capability and authorization exist',()=>{
  const result=evaluateInvestmentOrder({mode:'live',permission:INVEST_PERMISSION.DRAFT_ORDER,broker:BROKER_ADAPTERS.toss});
  assert.equal(result.allowed,false);
  assert.ok(result.violations.includes('USER_APPROVAL_REQUIRED'));
  assert.ok(result.violations.includes('BROKER_LIVE_TRADING_DISABLED'));
  assert.ok(result.violations.includes('BROKER_AUTHORIZATION_REQUIRED'));
});
test('risk governor enforces concentration loss leverage and stale quote limits',()=>{
  const result=evaluateInvestmentOrder({mode:'simulation',limits:{maxPositionPct:20,maxDailyLossPct:3,maxLeverage:1,maxQuoteAgeSeconds:30},metrics:{projectedPositionPct:31,dailyLossPct:4,projectedLeverage:1.2,quoteAgeSeconds:60}});
  assert.deepEqual(new Set(result.violations),new Set(['STALE_QUOTE','POSITION_CONCENTRATION_LIMIT','DAILY_LOSS_LIMIT','LEVERAGE_LIMIT']));
});

test('multi broker portfolio is aggregated without merging account authority',()=>{
  const portfolio=aggregatePortfolio([
    {brokerId:'toss',accountId:'a',cash:100,marketValue:200,positions:[{symbol:'005930',value:200}]},
    {brokerId:'ibkr',accountId:'b',cash:50,marketValue:150,positions:[{symbol:'AAPL',value:150}]}
  ]);
  assert.equal(portfolio.totalValue,500);
  assert.deepEqual(portfolio.brokers,['toss','ibkr']);
  assert.equal(portfolio.positions[0].accountId,'a');
  assert.equal(portfolio.positions[1].accountId,'b');
});

test('committee keeps dissent and invalidation conditions visible',()=>{
  const decision=investmentCommitteeDecision([
    {role:'fundamental',score:1,confidence:.8,rationale:'quality',invalidationConditions:['earnings deterioration']},
    {role:'risk',score:-1,confidence:.9,rationale:'concentration'}
  ]);
  assert.equal(decision.decision,'hold');
  assert.deepEqual(decision.dissent,['risk']);
  assert.deepEqual(decision.invalidationConditions,['earnings deterioration']);
});

test('AI CIO coordinates stock decisions but cannot override risk governor or kill switch',()=>{
  assert.equal(AI_CIO_POLICY.role,'AI Chief Investment Officer');
  assert.equal(AI_CIO_POLICY.liveExecutionAuthority,false);
  const allowed=aiCioDecision({committee:{decision:'consider'},risk:{allowed:true,violations:[]},operatingState:'ready',portfolio:{totalValue:1000,cash:200,positions:[{symbol:'A'}]}});
  assert.equal(allowed.action,'review_for_allocation');
  assert.equal(allowed.executionAuthorized,false);
  assert.equal(allowed.nextGate,'risk_governor');
  const blocked=aiCioDecision({committee:{decision:'consider'},risk:{allowed:false,violations:['DAILY_LOSS_LIMIT']},operatingState:'ready'});
  assert.equal(blocked.action,'halt');
  assert.deepEqual(blocked.riskViolations,['DAILY_LOSS_LIMIT']);
  const halted=aiCioDecision({committee:{decision:'consider'},risk:{allowed:true},operatingState:'halt'});
  assert.equal(halted.action,'halt');
});

test('audit event records references without broker credentials',()=>{
  const event=createInvestmentAuditEvent('approval',{subjectRef:'person:1',brokerId:'toss',orderRef:'o1',rationaleRef:'r1'},()=> '2026-09-13T09:00:00.000Z');
  assert.equal(event.schema,'ekodi.invest.audit.v1');
  assert.equal(event.type,'approval');
  assert.equal(event.at,'2026-09-13T09:00:00.000Z');
  assert.equal(JSON.stringify(event).includes('credential'),false);
});
