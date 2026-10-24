import test from 'node:test';
import assert from 'node:assert/strict';
import {
 AUTOPILOT_DEFAULT_STATE,emptyAutopilotPolicy,normalizeAutopilotPolicy,missingPolicyFields,policyFingerprint,policyChangeRequiresReapproval,
 transitionAutopilotState,evaluateLiveActivation,evaluateAutopilotOrder,evaluateAutopilotSentinel,createPaperBroker,reconcileLedger,
 runBacktest,strategyWeights,walkForwardEvaluate,stressTestStrategy,evaluateStrategyAcceptance,syntheticRegime,buildAutopilotReport,ALLOCATION_EXAMPLE
} from '../invest-autopilot-core.js';

// 2026-10-26 (Mon) 10:00 KST
const NOW=Date.UTC(2026,9,26,1,0,0);
const POLICY_INPUT={totalBudget:10_000_000,maxOrderAmount:1_000_000,maxDailyBuyAmount:2_000_000,maxPositions:5,maxPositionWeightPct:20,minCashPct:10,
 dailyLossLimitPct:2,totalLossLimitPct:10,horizonYears:10,markets:['KR','US'],assetTypes:['ETF','STOCK'],riskProfile:'balanced',
 tradingWindow:{start:'09:10',end:'15:10',tz:'Asia/Seoul'},maxTradesPerDay:5,alertChannels:['admin','email']};
const policy=normalizeAutopilotPolicy(POLICY_INPUT).policy;
const intent=(over={})=>({idempotencyKey:'paper:2026-10-26:abc123',symbol:'069500',market:'KR',assetType:'ETF',side:'BUY',qty:10,limitPrice:35000,orderType:'LIMIT',...over});
const ctx=(over={})=>({state:'PAPER_TRADING',policy,now:NOW,quote:{symbol:'069500',price:35000,prevClose:34800,ts:NOW-1000},
 account:{cash:10_000_000,positions:[],openOrders:[]},ledger:{dayStartEquity:10_000_000,startEquity:10_000_000,buyAmountToday:0,tradesToday:0},
 brokerHealthy:true,ledgerReconciled:true,seenOrderKeys:[],...over});

test('money and loss limits start unset and the default state is research only',()=>{
 const empty=emptyAutopilotPolicy();
 assert.equal(AUTOPILOT_DEFAULT_STATE,'RESEARCH_ONLY');
 for(const key of ['totalBudget','maxOrderAmount','maxDailyBuyAmount','dailyLossLimitPct','totalLossLimitPct'])assert.equal(empty[key],null);
 assert.ok(missingPolicyFields(empty).includes('totalBudget'));
 assert.equal(ALLOCATION_EXAMPLE.illustrativeOnly,true);
});

test('policy validation rejects leverage, inconsistent limits and unapproved paid alerts',()=>{
 assert.equal(normalizeAutopilotPolicy(POLICY_INPUT).valid,true);
 assert.equal(normalizeAutopilotPolicy({...POLICY_INPUT,leverage:true}).errors.leverage,'blocked_by_hard_limit');
 assert.equal(normalizeAutopilotPolicy({...POLICY_INPUT,maxOrderAmount:20_000_000}).errors.maxOrderAmount,'exceeds_total_budget');
 assert.equal(normalizeAutopilotPolicy({...POLICY_INPUT,dailyLossLimitPct:20}).errors.dailyLossLimitPct,'exceeds_total_loss');
 assert.equal(normalizeAutopilotPolicy({...POLICY_INPUT,alertChannels:['sms']}).errors.alertChannels,'paid_channel_requires_cost_approval');
 assert.equal(normalizeAutopilotPolicy({...POLICY_INPUT,markets:['CRYPTO']}).errors.markets,'invalid_choice');
});

test('expanding authority requires re-approval but narrowing does not',()=>{
 assert.deepEqual(policyChangeRequiresReapproval(policy,{...policy,totalBudget:5_000_000}).required,false);
 const grow=policyChangeRequiresReapproval(policy,{...policy,totalBudget:20_000_000,markets:['KR','US'],assetTypes:['ETF','STOCK','BOND_ETF']});
 assert.deepEqual(grow.reasons,['budget_increase','asset_type_expansion']);
 assert.notEqual(policyFingerprint(policy),policyFingerprint({...policy,totalBudget:9_000_000}));
});

test('state machine: paper needs a complete policy, live needs every gate, stop is always allowed',()=>{
 assert.equal(transitionAutopilotState('RESEARCH_ONLY','PAPER_TRADING',{policy:emptyAutopilotPolicy(),riskEngineHealthy:true}).reason,'policy_incomplete');
 assert.equal(transitionAutopilotState('RESEARCH_ONLY','PAPER_TRADING',{policy,riskEngineHealthy:true}).ok,true);
 assert.equal(transitionAutopilotState('RESEARCH_ONLY','LIVE_ACTIVE',{policy}).ok,false);
 assert.equal(transitionAutopilotState('PAPER_TRADING','LIVE_PENDING_APPROVAL',{paperValidation:{passed:false}}).reason,'paper_validation_required');
 const live=transitionAutopilotState('LIVE_PENDING_APPROVAL','LIVE_ACTIVE',{policy,paperValidation:{passed:true},riskEngineHealthy:true});
 assert.equal(live.ok,false);
 assert.ok(live.missing.includes('explicitLiveApproval'));
 assert.ok(live.missing.includes('platformLiveSwitch'));
 for(const from of ['RESEARCH_ONLY','PAPER_TRADING','LIVE_ACTIVE','PAUSED'])assert.equal(transitionAutopilotState(from,'EMERGENCY_STOPPED').ok,true);
 assert.equal(transitionAutopilotState('EMERGENCY_STOPPED','PAPER_TRADING',{policy,riskEngineHealthy:true}).reason,'recovery_not_verified');
});

test('live activation stays blocked while the platform live lock is off, even with every owner gate',()=>{
 const approval={approvedAt:'2026-10-26T00:00:00Z',approvedBy:'owner',statement:'LIVE_TRADING_APPROVED_BY_OWNER',policyFingerprint:policyFingerprint(policy),recordedBy:'server'};
 const result=evaluateLiveActivation({policy,liveApproval:approval,accountOwnershipVerified:true,brokerAutomationTermsVerified:true,brokerOrderApiVerified:true,
  paperValidation:{passed:true},disclosureAcknowledgedAt:'2026-10-26',riskEngineHealthy:true,envLiveApproved:true});
 assert.deepEqual(result.blockers,['platformLiveSwitch']);
 const stale=evaluateLiveActivation({policy:{...policy,totalBudget:20_000_000},liveApproval:approval});
 assert.ok(stale.blockers.includes('serverApprovalRecordMatches'));
});

test('risk engine allows a compliant paper order',()=>{
 const r=evaluateAutopilotOrder(intent(),ctx());
 assert.deepEqual(r.reasons,[]);
 assert.equal(r.allowed,true);
 assert.equal(r.mode,'paper');
});

test('risk engine enforces every hard limit independently of strategy',()=>{
 const reasons=(i,c)=>evaluateAutopilotOrder(intent(i),ctx(c)).reasons;
 assert.ok(reasons({},{state:'RESEARCH_ONLY'}).includes('state_not_trading'));
 assert.ok(reasons({},{state:'EMERGENCY_STOPPED'}).includes('state_not_trading'));
 assert.ok(reasons({},{state:'LIVE_ACTIVE'}).includes('live_activation_missing'));
 assert.ok(reasons({},{policy:emptyAutopilotPolicy()}).includes('policy_incomplete'));
 assert.ok(reasons({qty:40}).includes('order_amount_limit'));
 assert.ok(reasons({},{ledger:{buyAmountToday:1_900_000,dayStartEquity:1e7,startEquity:1e7}}).includes('daily_buy_limit'));
 assert.ok(reasons({},{account:{cash:10_000_000,positions:[{symbol:'A',qty:1,price:9_800_000}],openOrders:[]}}).includes('budget_exceeded'));
 assert.ok(reasons({qty:25},{account:{cash:10_000_000,positions:[{symbol:'069500',qty:40,price:35000}],openOrders:[]}}).includes('position_weight_limit'));
 assert.ok(reasons({},{account:{cash:10_000_000,positions:['A','B','C','D','E'].map(symbol=>({symbol,qty:1,price:1000})),openOrders:[]}}).includes('max_positions'));
 assert.ok(reasons({},{seenOrderKeys:['paper:2026-10-26:abc123']}).includes('duplicate_order'));
 assert.ok(reasons({idempotencyKey:''}).includes('idempotency_key_required'));
 assert.ok(reasons({leverage:2}).includes('leverage_or_derivative_blocked'));
 assert.ok(reasons({orderType:'MARKET'}).includes('order_type_blocked'));
 assert.ok(reasons({market:'JP'}).includes('market_not_allowed'));
 assert.ok(reasons({assetType:'BOND_ETF'}).includes('asset_type_not_allowed'));
 assert.ok(reasons({},{quote:{symbol:'069500',price:35000,ts:NOW-60_000}}).includes('market_data_stale'));
 assert.ok(reasons({limitPrice:40000}).includes('abnormal_price'));
 assert.ok(reasons({},{quote:{symbol:'069500',price:35000,prevClose:20000,ts:NOW}}).includes('abnormal_price'));
 assert.ok(reasons({},{brokerHealthy:false}).includes('broker_unavailable'));
 assert.ok(reasons({},{ledgerReconciled:false}).includes('ledger_mismatch'));
 assert.ok(reasons({},{pendingUnknownOrders:1}).includes('unresolved_order_status'));
 assert.ok(reasons({},{now:Date.UTC(2026,9,26,12,0,0),quote:{symbol:'069500',price:35000,ts:Date.UTC(2026,9,26,12,0,0)}}).includes('outside_trading_window'));
 assert.ok(reasons({},{ledger:{tradesToday:5,dayStartEquity:1e7,startEquity:1e7}}).includes('trade_frequency_limit'));
 assert.ok(reasons({},{account:{cash:9_700_000,positions:[],openOrders:[]}}).includes('daily_loss_limit'));
 assert.ok(reasons({},{account:{cash:8_900_000,positions:[],openOrders:[]},ledger:{dayStartEquity:8_900_000,startEquity:10_000_000}}).includes('total_loss_limit'));
 assert.ok(reasons({side:'SELL'}).includes('short_sale_blocked'));
 assert.ok(reasons({},{account:{cash:200_000,positions:[],openOrders:[]},ledger:{dayStartEquity:200_000,startEquity:200_000}}).includes('insufficient_cash'));
});

test('sentinel halts new orders on loss, data delay or broker failure without liquidating holdings',()=>{
 const ok=evaluateAutopilotSentinel({policy,now:NOW,equity:1e7,dayStartEquity:1e7,startEquity:1e7,lastQuoteAt:NOW-1000,brokerHealthy:true});
 assert.equal(ok.haltNewOrders,false);
 const loss=evaluateAutopilotSentinel({policy,now:NOW,equity:9_790_000,dayStartEquity:1e7,startEquity:1e7});
 assert.equal(loss.haltNewOrders,true);
 assert.equal(loss.liquidateHoldings,false);
 assert.equal(evaluateAutopilotSentinel({policy,now:NOW,lastQuoteAt:NOW-120_000}).alerts[0].code,'market_data_delayed');
 assert.equal(evaluateAutopilotSentinel({policy,brokerHealthy:false}).recommendedState,'PAUSED');
});

test('paper broker is idempotent and handles partial fills, rejects and unknown status',()=>{
 const broker=createPaperBroker({cash:1_000_000,feeRate:0.001,slippageBps:10});
 const o={idempotencyKey:'k-0000001',symbol:'069500',side:'BUY',qty:10,limitPrice:35100};
 const first=broker.submit(o,{price:35000},{liquidityQty:4});
 assert.equal(first.status,'PARTIALLY_FILLED');
 assert.equal(first.filledQty,4);
 const again=broker.submit(o,{price:35000});
 assert.equal(again.duplicate,true);
 assert.equal(broker.snapshot().fills.length,1);
 assert.equal(broker.cancel('k-0000001').status,'PARTIALLY_FILLED_CANCELLED');
 const unknown=broker.submit({...o,idempotencyKey:'k-0000002'},{price:35000},{failMode:'timeout'});
 assert.equal(unknown.status,'UNKNOWN');
 // An unknown order is resolved by querying, never by resending the same key.
 assert.equal(broker.submit({...o,idempotencyKey:'k-0000002'},{price:35000}).duplicate,true);
 assert.equal(broker.submit({...o,idempotencyKey:'k-0000003',qty:1000},{price:35000}).status,'REJECTED');
 const snap=broker.snapshot();
 const rec=reconcileLedger({cash:snap.cash,positions:snap.positions},snap);
 assert.equal(rec.reconciled,false);
 assert.deepEqual(rec.unknownOrders,['k-0000002']);
 broker.resolveUnknown('k-0000002',{status:'REJECTED'});
 assert.equal(reconcileLedger({cash:snap.cash,positions:snap.positions},broker.snapshot()).reconciled,true);
 assert.equal(reconcileLedger({cash:0,positions:[]},broker.snapshot()).diffs.length>0,true);
});

test('backtest signals never read the current or future bar',()=>{
 const base=Array.from({length:300},(_,i)=>100+i);
 const spiked=[...base];spiked[200]=10_000;
 const s={id:'trend_filter',weights:{A:1},lookback:20};
 assert.deepEqual(strategyWeights(s,{A:base},200),strategyWeights(s,{A:spiked},200));
});

test('backtest, walk-forward, stress and acceptance criteria report cost-aware metrics',()=>{
 const prices={A:syntheticRegime('bull',600,3),B:syntheticRegime('sideways',600,5)};
 const strategy={id:'static_rebalance',weights:{A:0.6,B:0.3}};
 const bt=runBacktest({prices,strategy});
 assert.ok(bt.costs>0);
 assert.ok(bt.metrics.maxDrawdown>=0&&bt.metrics.maxDrawdown<1);
 const wf=walkForwardEvaluate({prices,strategy,benchmark:{id:'static_rebalance',weights:{A:1}}});
 assert.ok(wf.outOfSample.days>0&&wf.inSample.days>0);
 const stress=stressTestStrategy(strategy);
 assert.equal(stress.length,5);
 assert.ok(stress.every(s=>s.synthetic===true));
 const verdict=evaluateStrategyAcceptance({walkForward:wf,stress,paper:{days:10},policy});
 assert.equal(verdict.passed,false);
 assert.ok(verdict.failures.includes('paper_period_insufficient'));
});

test('weekly report labels unknown values instead of guessing',()=>{
 const report=buildAutopilotReport('weekly',{policy,equity:10_100_000,committed:2_000_000,now:NOW});
 assert.equal(report.dataBasis,'paper');
 assert.equal(report.lines.find(l=>l.label==='투자한도 사용률').value,'20.00%');
 assert.equal(report.lines.find(l=>l.label==='실현손익').value,'확인 필요');
 assert.match(report.disclaimer,/보장하지 않습니다/);
});
