// EKODI Private Wealth autopilot core: deterministic policy, state, risk, paper trading and backtest.
// No network, no AI provider, no broker credentials. Strategy signals are inputs; this module decides nothing about profit.
import { BROKER_ADAPTERS, INVEST_MARKET_POLICY, evaluateInvestmentOrder } from './invest-market-core.js';

// Single owner of the private wealth surface. Shared by the /my/invest page and the workspace API.
export const INVEST_DEFAULT_OWNER='topmaster.joseph@gmail.com';
export const investOwnerEmail=env=>String(env?.INVEST_OWNER_EMAIL||env?.ADMIN_EMAIL||INVEST_DEFAULT_OWNER).trim().toLowerCase();

export const AUTOPILOT_STATES=Object.freeze(['RESEARCH_ONLY','PAPER_TRADING','LIVE_PENDING_APPROVAL','LIVE_ACTIVE','PAUSED','EMERGENCY_STOPPED']);
export const AUTOPILOT_DEFAULT_STATE='RESEARCH_ONLY';
export const AUTOPILOT_MARKETS=Object.freeze(['KR','US']);
export const AUTOPILOT_ASSET_TYPES=Object.freeze(['STOCK','ETF','BOND_ETF','CASH_EQUIVALENT']);
export const AUTOPILOT_ALERT_CHANNELS=Object.freeze(['admin','email','sms']);
// Channels that create a new running cost stay off until the owner approves that cost separately.
export const AUTOPILOT_PAID_CHANNELS=Object.freeze(['sms']);

// Illustrative core/satellite split shown to the owner. Never applied automatically.
export const ALLOCATION_EXAMPLE=Object.freeze({illustrativeOnly:true,core:{label:'장기 성장 자산 (글로벌 분산 ETF 등)',pct:60},stable:{label:'안정·유동성 자산 (단기 우량채·현금성)',pct:25},satellite:{label:'AI 전략 운용 자산',pct:15}});

export const AUTOPILOT_HARD_LIMITS=Object.freeze({
 leverageAllowed:false,marginAllowed:false,derivativesAllowed:false,shortSellingAllowed:false,
 allowedOrderTypes:['LIMIT'],maxQuoteAgeMs:15000,maxLimitDeviationPct:3,maxDailyMovePct:30
});

const POLICY_FIELDS=Object.freeze({
 totalBudget:{type:'krw',required:true,label:'AI 자동투자 허용 총자금'},
 maxOrderAmount:{type:'krw',required:true,label:'1회 최대 주문금액'},
 maxDailyBuyAmount:{type:'krw',required:true,label:'1일 최대 신규매수금액'},
 maxPositions:{type:'int',required:true,min:1,max:50,label:'최대 보유종목 수'},
 maxPositionWeightPct:{type:'pct',required:true,min:1,max:100,label:'종목당 최대 비중'},
 minCashPct:{type:'pct',required:true,min:0,max:100,label:'최소 현금 비중'},
 dailyLossLimitPct:{type:'pct',required:true,min:0.1,max:50,label:'하루 허용 평가손실'},
 totalLossLimitPct:{type:'pct',required:true,min:0.1,max:90,label:'전체 누적 허용손실'},
 horizonYears:{type:'int',required:true,min:1,max:40,label:'투자기간'},
 markets:{type:'list',required:true,values:AUTOPILOT_MARKETS,label:'허용 주식시장'},
 assetTypes:{type:'list',required:true,values:AUTOPILOT_ASSET_TYPES,label:'허용 자산 종류'},
 riskProfile:{type:'enum',required:true,values:['conservative','balanced','growth'],label:'투자 성향'},
 tradingWindow:{type:'window',required:true,label:'자동매매 허용시간'},
 maxTradesPerDay:{type:'int',required:true,min:1,max:100,label:'거래 빈도 제한 (1일)'},
 alertChannels:{type:'list',required:true,values:AUTOPILOT_ALERT_CHANNELS,label:'위험 알림 수단'}
});
export const AUTOPILOT_POLICY_FIELDS=POLICY_FIELDS;

// Every money and loss limit starts unset; the owner must choose them.
export function emptyAutopilotPolicy(){
 return Object.fromEntries(Object.keys(POLICY_FIELDS).map(key=>[key,null]));
}

const HHMM=/^([01]\d|2[0-3]):([0-5]\d)$/;
function normalizeField(key,spec,raw){
 if(raw===null||raw===undefined||raw==='')return {value:null};
 if(spec.type==='krw'){
  const n=Number(raw);
  if(!Number.isFinite(n)||n<=0||n>1e13||Math.floor(n)!==n)return {error:'invalid_amount'};
  return {value:n};
 }
 if(spec.type==='int'||spec.type==='pct'){
  const n=Number(raw);
  if(!Number.isFinite(n))return {error:'invalid_number'};
  if(spec.type==='int'&&Math.floor(n)!==n)return {error:'invalid_integer'};
  if(n<spec.min||n>spec.max)return {error:'out_of_range'};
  return {value:n};
 }
 if(spec.type==='enum')return spec.values.includes(raw)?{value:raw}:{error:'invalid_choice'};
 if(spec.type==='list'){
  if(!Array.isArray(raw))return {error:'invalid_list'};
  const list=[...new Set(raw.map(String))];
  if(!list.length)return {value:null};
  return list.every(v=>spec.values.includes(v))?{value:list.sort()}:{error:'invalid_choice'};
 }
 if(spec.type==='window'){
  const start=String(raw?.start||''),end=String(raw?.end||'');
  if(!HHMM.test(start)||!HHMM.test(end)||start>=end)return {error:'invalid_window'};
  const tz=raw?.tz==='America/New_York'?'America/New_York':'Asia/Seoul';
  return {value:{start,end,tz}};
 }
 return {error:'unknown_field'};
}

export function normalizeAutopilotPolicy(input={}){
 const policy=emptyAutopilotPolicy(),errors={};
 for(const [key,spec] of Object.entries(POLICY_FIELDS)){
  const result=normalizeField(key,spec,input?.[key]);
  if(result.error)errors[key]=result.error;else policy[key]=result.value;
 }
 const forbidden=['leverage','leverageAllowed','margin','marginAllowed','derivatives','derivativesAllowed','shortSelling'];
 for(const key of forbidden)if(input&&input[key]&&input[key]!=='false')errors[key]='blocked_by_hard_limit';
 if(policy.totalBudget&&policy.maxOrderAmount&&policy.maxOrderAmount>policy.totalBudget)errors.maxOrderAmount='exceeds_total_budget';
 if(policy.totalBudget&&policy.maxDailyBuyAmount&&policy.maxDailyBuyAmount>policy.totalBudget)errors.maxDailyBuyAmount='exceeds_total_budget';
 if(!errors.maxOrderAmount&&policy.maxOrderAmount&&policy.maxDailyBuyAmount&&policy.maxOrderAmount>policy.maxDailyBuyAmount)errors.maxOrderAmount='exceeds_daily_buy';
 if(policy.dailyLossLimitPct&&policy.totalLossLimitPct&&policy.dailyLossLimitPct>policy.totalLossLimitPct)errors.dailyLossLimitPct='exceeds_total_loss';
 if(policy.alertChannels?.some(c=>AUTOPILOT_PAID_CHANNELS.includes(c))&&input?.paidAlertCostApproved!==true)errors.alertChannels='paid_channel_requires_cost_approval';
 return {policy,errors,valid:Object.keys(errors).length===0};
}

export function missingPolicyFields(policy={}){
 return Object.entries(POLICY_FIELDS).filter(([key,spec])=>spec.required&&(policy[key]===null||policy[key]===undefined)).map(([key])=>key);
}

// Stable fingerprint so a live approval is bound to the exact policy it approved.
export function policyFingerprint(policy={}){
 const canonical=JSON.stringify(Object.keys(POLICY_FIELDS).map(key=>[key,policy[key]??null]));
 let h1=0x811c9dc5,h2=0x01000193;
 for(let i=0;i<canonical.length;i++){const c=canonical.charCodeAt(i);h1=Math.imul(h1^c,16777619)>>>0;h2=Math.imul(h2+c,2246822519)>>>0}
 return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
}

// Changes that expand authority need a fresh live approval; narrowing does not.
export function policyChangeRequiresReapproval(previous={},next={}){
 const reasons=[];
 const grew=key=>Number(next[key]||0)>Number(previous[key]||0);
 if(grew('totalBudget'))reasons.push('budget_increase');
 if(grew('maxOrderAmount')||grew('maxDailyBuyAmount'))reasons.push('order_limit_increase');
 if(grew('maxPositionWeightPct')||grew('maxPositions'))reasons.push('concentration_increase');
 if(grew('dailyLossLimitPct')||grew('totalLossLimitPct'))reasons.push('loss_limit_increase');
 const widened=key=>(next[key]||[]).some(v=>!(previous[key]||[]).includes(v));
 if(widened('markets'))reasons.push('market_expansion');
 if(widened('assetTypes'))reasons.push('asset_type_expansion');
 if(previous.riskProfile&&next.riskProfile&&previous.riskProfile!==next.riskProfile)reasons.push('risk_profile_change');
 return {required:reasons.length>0,reasons};
}

export const LIVE_ACTIVATION_GATES=Object.freeze([
 'accountOwnershipVerified','brokerAutomationTermsVerified','brokerOrderApiVerified','policyComplete','paperValidationPassed',
 'costAndRiskDisclosureAcknowledged','explicitLiveApproval','serverApprovalRecordMatches','riskEngineHealthy','platformLiveSwitch'
]);

export function evaluateLiveActivation(input={}){
 const policy=input.policy||{};
 const approval=input.liveApproval||null;
 const checks={
  accountOwnershipVerified:input.accountOwnershipVerified===true,
  brokerAutomationTermsVerified:input.brokerAutomationTermsVerified===true,
  brokerOrderApiVerified:input.brokerOrderApiVerified===true,
  policyComplete:missingPolicyFields(policy).length===0,
  paperValidationPassed:input.paperValidation?.passed===true,
  costAndRiskDisclosureAcknowledged:input.disclosureAcknowledgedAt?true:false,
  explicitLiveApproval:Boolean(approval?.approvedAt&&approval?.approvedBy&&approval?.statement==='LIVE_TRADING_APPROVED_BY_OWNER'),
  serverApprovalRecordMatches:Boolean(approval&&approval.policyFingerprint===policyFingerprint(policy)&&approval.recordedBy==='server'),
  riskEngineHealthy:input.riskEngineHealthy===true,
  // The platform-wide lock in invest-market-core stays authoritative; flipping it is a separate governed release.
  platformLiveSwitch:INVEST_MARKET_POLICY.autonomousLiveTrading===true&&input.envLiveApproved===true
 };
 const blockers=LIVE_ACTIVATION_GATES.filter(id=>checks[id]!==true);
 return {eligible:blockers.length===0,checks,blockers};
}

const TRADING_STATES=new Set(['PAPER_TRADING','LIVE_ACTIVE']);
export function transitionAutopilotState(current,target,gates={}){
 const from=AUTOPILOT_STATES.includes(current)?current:AUTOPILOT_DEFAULT_STATE;
 if(!AUTOPILOT_STATES.includes(target))return {ok:false,state:from,reason:'unknown_state'};
 if(from===target)return {ok:true,state:from,reason:'unchanged'};
 // Stopping and stepping down are always allowed.
 if(target==='EMERGENCY_STOPPED')return {ok:true,state:target,reason:'emergency_stop'};
 if(target==='RESEARCH_ONLY')return {ok:true,state:target,reason:'downgrade'};
 if(target==='PAUSED')return TRADING_STATES.has(from)||from==='LIVE_PENDING_APPROVAL'?{ok:true,state:target,reason:'pause'}:{ok:false,state:from,reason:'not_running'};
 if(from==='EMERGENCY_STOPPED'&&!(gates.riskEngineHealthy===true&&gates.reconciled===true))return {ok:false,state:from,reason:'recovery_not_verified'};
 if(target==='PAPER_TRADING'){
  const missing=missingPolicyFields(gates.policy||{});
  if(missing.length)return {ok:false,state:from,reason:'policy_incomplete',missing};
  if(gates.riskEngineHealthy!==true)return {ok:false,state:from,reason:'risk_engine_unhealthy'};
  return {ok:true,state:target,reason:'paper_start'};
 }
 if(target==='LIVE_PENDING_APPROVAL'){
  if(!['PAPER_TRADING','PAUSED'].includes(from))return {ok:false,state:from,reason:'paper_trading_required_first'};
  if(gates.paperValidation?.passed!==true)return {ok:false,state:from,reason:'paper_validation_required'};
  return {ok:true,state:target,reason:'awaiting_owner_live_approval'};
 }
 if(target==='LIVE_ACTIVE'){
  if(!['LIVE_PENDING_APPROVAL','PAUSED'].includes(from))return {ok:false,state:from,reason:'live_approval_stage_required'};
  const live=evaluateLiveActivation(gates);
  return live.eligible?{ok:true,state:target,reason:'live_activated'}:{ok:false,state:from,reason:'live_gates_blocked',missing:live.blockers};
 }
 return {ok:false,state:from,reason:'transition_not_allowed'};
}

function minutesIn(tz,now){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false,weekday:'short'}).formatToParts(new Date(now));
 const get=type=>parts.find(p=>p.type===type)?.value;
 return {weekday:get('weekday'),hhmm:`${get('hour')==='24'?'00':get('hour')}:${get('minute')}`};
}
export function withinTradingWindow(window,now){
 if(!window)return false;
 const {weekday,hhmm}=minutesIn(window.tz||'Asia/Seoul',now);
 if(weekday==='Sat'||weekday==='Sun')return false;
 return hhmm>=window.start&&hhmm<=window.end;
}

export function estimateOrderCost(qty,price,{feeRate=0.00015,slippageBps=10,side='BUY'}={}){
 const gross=qty*price;
 const slippage=gross*slippageBps/10000;
 const fee=(gross+(side==='BUY'?slippage:-slippage))*feeRate;
 return {gross,slippage,fee,total:side==='BUY'?gross+slippage+fee:gross-slippage-fee};
}

// Independent Risk Engine. Strategy code cannot bypass it: every order passes here first, in paper and live.
export function evaluateAutopilotOrder(intent={},ctx={}){
 const reasons=[];
 const policy=ctx.policy||{};
 const state=ctx.state||AUTOPILOT_DEFAULT_STATE;
 const mode=state==='LIVE_ACTIVE'?'live':'paper';
 const side=intent.side==='SELL'?'SELL':intent.side==='BUY'?'BUY':null;
 const qty=Number(intent.qty),limit=Number(intent.limitPrice);
 const quote=ctx.quote||{};
 const now=Number(ctx.now??Date.now());
 const account=ctx.account||{};
 const ledger=ctx.ledger||{};
 const costs=ctx.costs||{};

 if(!TRADING_STATES.has(state))reasons.push('state_not_trading');
 if(mode==='live'&&ctx.liveActivation?.eligible!==true)reasons.push('live_activation_missing');
 if(missingPolicyFields(policy).length)reasons.push('policy_incomplete');
 if(!side)reasons.push('invalid_side');
 if(!(qty>0)||!Number.isFinite(qty))reasons.push('invalid_qty');
 if(!(limit>0)||!Number.isFinite(limit))reasons.push('invalid_limit_price');
 if(!AUTOPILOT_HARD_LIMITS.allowedOrderTypes.includes(intent.orderType||'LIMIT'))reasons.push('order_type_blocked');
 if(intent.leverage||intent.margin||intent.derivative||intent.creditOrder)reasons.push('leverage_or_derivative_blocked');
 if(!/^[A-Za-z0-9.\-]{1,20}$/.test(String(intent.symbol||'')))reasons.push('invalid_symbol');
 if(!String(intent.idempotencyKey||'').match(/^[A-Za-z0-9:_\-]{8,120}$/))reasons.push('idempotency_key_required');
 else if((ctx.seenOrderKeys||[]).includes(intent.idempotencyKey))reasons.push('duplicate_order');
 if(policy.markets&&!policy.markets.includes(intent.market))reasons.push('market_not_allowed');
 if(policy.assetTypes&&!policy.assetTypes.includes(intent.assetType))reasons.push('asset_type_not_allowed');
 if(ctx.brokerHealthy===false)reasons.push('broker_unavailable');
 if(ctx.ledgerReconciled===false)reasons.push('ledger_mismatch');
 if(ctx.pendingUnknownOrders>0)reasons.push('unresolved_order_status');

 const quotePrice=Number(quote.price);
 const quoteAge=now-Number(quote.ts||0);
 if(!(quotePrice>0)||quote.symbol!==intent.symbol)reasons.push('invalid_quote');
 else{
  if(!(quoteAge>=0&&quoteAge<=Number(ctx.maxQuoteAgeMs??AUTOPILOT_HARD_LIMITS.maxQuoteAgeMs)))reasons.push('market_data_stale');
  if(limit>0&&Math.abs(limit-quotePrice)/quotePrice*100>AUTOPILOT_HARD_LIMITS.maxLimitDeviationPct)reasons.push('abnormal_price');
  const prev=Number(quote.prevClose);
  if(prev>0&&Math.abs(quotePrice-prev)/prev*100>AUTOPILOT_HARD_LIMITS.maxDailyMovePct)reasons.push('abnormal_price');
  if(quote.halted===true)reasons.push('trading_halted');
 }
 if(policy.tradingWindow&&!withinTradingWindow(policy.tradingWindow,now))reasons.push('outside_trading_window');
 if(policy.maxTradesPerDay&&Number(ledger.tradesToday||0)>=policy.maxTradesPerDay)reasons.push('trade_frequency_limit');

 const positions=account.positions||[];
 const held=positions.find(p=>p.symbol===intent.symbol);
 const est=side&&qty>0&&limit>0?estimateOrderCost(qty,limit,{...costs,side}):{total:0,gross:0};
 const marketValue=positions.reduce((s,p)=>s+Number(p.qty||0)*Number(p.price||0),0);
 const openBuys=(account.openOrders||[]).filter(o=>o.side==='BUY').reduce((s,o)=>s+Number(o.amount||0),0);
 const equity=Number(account.cash||0)+marketValue;
 const dayLossPct=ledger.dayStartEquity>0?Math.max(0,(ledger.dayStartEquity-equity)/ledger.dayStartEquity*100):0;
 const totalLossPct=ledger.startEquity>0?Math.max(0,(ledger.startEquity-equity)/ledger.startEquity*100):0;

 if(side==='BUY'){
  if(policy.maxOrderAmount&&est.total>policy.maxOrderAmount)reasons.push('order_amount_limit');
  if(policy.maxDailyBuyAmount&&Number(ledger.buyAmountToday||0)+est.total>policy.maxDailyBuyAmount)reasons.push('daily_buy_limit');
  const committed=marketValue+openBuys+Number(account.reservedAmount||0);
  if(policy.totalBudget&&committed+est.total>policy.totalBudget)reasons.push('budget_exceeded');
  if(policy.totalBudget&&policy.minCashPct!=null&&(policy.totalBudget-committed-est.total)<policy.totalBudget*policy.minCashPct/100)reasons.push('min_cash_breach');
  if(est.total>Number(account.cash||0)-openBuys-Number(account.reservedAmount||0))reasons.push('insufficient_cash');
  const after=(held?Number(held.qty)*Number(held.price):0)+est.gross;
  if(policy.totalBudget&&policy.maxPositionWeightPct&&after>policy.totalBudget*policy.maxPositionWeightPct/100)reasons.push('position_weight_limit');
  if(!held&&policy.maxPositions&&positions.length>=policy.maxPositions)reasons.push('max_positions');
  if(policy.dailyLossLimitPct&&dayLossPct>=policy.dailyLossLimitPct)reasons.push('daily_loss_limit');
  if(policy.totalLossLimitPct&&totalLossPct>=policy.totalLossLimitPct)reasons.push('total_loss_limit');
 }
 if(side==='SELL'&&!(held&&Number(held.qty)>=qty))reasons.push('short_sale_blocked');

 // Reuse the platform's shared order guard as the last layer (stale quote, leverage, concentration).
 const shared=evaluateInvestmentOrder({mode:'simulation',limits:{maxQuoteAgeSeconds:Number(ctx.maxQuoteAgeMs??AUTOPILOT_HARD_LIMITS.maxQuoteAgeMs)/1000,maxPositionPct:policy.maxPositionWeightPct??25,maxDailyLossPct:policy.dailyLossLimitPct??5,maxLeverage:1},metrics:{quoteAgeSeconds:Math.max(0,quoteAge)/1000,projectedLeverage:intent.leverage?2:1}});
 for(const v of shared.violations)if(v==='LEVERAGE_LIMIT'&&!reasons.includes('leverage_or_derivative_blocked'))reasons.push('leverage_or_derivative_blocked');

 const unique=[...new Set(reasons)];
 return {allowed:unique.length===0,mode,reasons:unique,estimate:est,exposure:{equity,marketValue,openBuys,dayLossPct,totalLossPct},engine:'ekodi.invest.risk-engine.v1'};
}

// Sentinel: portfolio-level checks that stop new orders without touching existing holdings.
export function evaluateAutopilotSentinel(ctx={}){
 const alerts=[];
 const policy=ctx.policy||{};
 const now=Number(ctx.now??Date.now());
 const eq=Number(ctx.equity||0);
 if(ctx.riskEngineHealthy===false)alerts.push({code:'risk_engine_unhealthy',severity:'critical'});
 if(ctx.brokerHealthy===false)alerts.push({code:'broker_unavailable',severity:'critical'});
 if(ctx.ledgerReconciled===false)alerts.push({code:'ledger_mismatch',severity:'critical'});
 if(ctx.authExpiresAt&&Number(ctx.authExpiresAt)-now<24*3600e3)alerts.push({code:'broker_auth_expiring',severity:'warning'});
 if(ctx.lastQuoteAt&&now-Number(ctx.lastQuoteAt)>Number(ctx.maxQuoteAgeMs??AUTOPILOT_HARD_LIMITS.maxQuoteAgeMs)*4)alerts.push({code:'market_data_delayed',severity:'critical'});
 if(policy.dailyLossLimitPct&&ctx.dayStartEquity>0){
  const loss=(ctx.dayStartEquity-eq)/ctx.dayStartEquity*100;
  if(loss>=policy.dailyLossLimitPct)alerts.push({code:'daily_loss_limit_reached',severity:'critical'});
  else if(loss>=policy.dailyLossLimitPct*0.8)alerts.push({code:'daily_loss_limit_near',severity:'warning'});
 }
 if(policy.totalLossLimitPct&&ctx.startEquity>0){
  const loss=(ctx.startEquity-eq)/ctx.startEquity*100;
  if(loss>=policy.totalLossLimitPct)alerts.push({code:'total_loss_limit_reached',severity:'critical'});
  else if(loss>=policy.totalLossLimitPct*0.8)alerts.push({code:'total_loss_limit_near',severity:'warning'});
 }
 if(policy.totalBudget&&Number(ctx.committed||0)>policy.totalBudget)alerts.push({code:'budget_breach',severity:'critical'});
 const halt=alerts.some(a=>a.severity==='critical');
 return {haltNewOrders:halt,recommendedState:halt?'PAUSED':null,alerts,liquidateHoldings:false};
}

// Paper broker with idempotent orders, partial fills, slippage and fees.
export function createPaperBroker({cash=0,feeRate=0.00015,slippageBps=10,positions=[],realizedPnl=0}={}){
 const book={cash:Number(cash),realized:Number(realizedPnl)||0,positions:new Map(positions.map(p=>[p.symbol,{symbol:p.symbol,qty:Number(p.qty),avgCost:Number(p.avgCost??p.price),price:Number(p.price)}])),orders:new Map(),fills:[]};
 function submit(order,quote,{liquidityQty=Infinity,failMode=null}={}){
  if(book.orders.has(order.idempotencyKey))return {...book.orders.get(order.idempotencyKey),duplicate:true};
  if(failMode==='timeout'){const record={key:order.idempotencyKey,status:'UNKNOWN',filledQty:0};book.orders.set(order.idempotencyKey,record);return record}
  if(failMode==='reject'){const record={key:order.idempotencyKey,status:'REJECTED',filledQty:0};book.orders.set(order.idempotencyKey,record);return record}
  const side=order.side,price=Number(quote.price);
  const marketable=side==='BUY'?price<=order.limitPrice:price>=order.limitPrice;
  const fillQty=marketable?Math.min(order.qty,liquidityQty):0;
  const execPrice=side==='BUY'?price*(1+slippageBps/10000):price*(1-slippageBps/10000);
  const record={key:order.idempotencyKey,symbol:order.symbol,side,qty:order.qty,limitPrice:order.limitPrice,filledQty:0,avgPrice:0,fee:0,status:'OPEN'};
  if(fillQty>0){
   const gross=fillQty*execPrice,fee=gross*feeRate;
   const pos=book.positions.get(order.symbol)||{symbol:order.symbol,qty:0,avgCost:0,price};
   if(side==='BUY'){
    if(gross+fee>book.cash){record.status='REJECTED';record.reason='insufficient_cash';book.orders.set(order.idempotencyKey,record);return record}
    book.cash-=gross+fee;pos.avgCost=(pos.avgCost*pos.qty+gross+fee)/(pos.qty+fillQty);pos.qty+=fillQty;
   }else{
    if(pos.qty<fillQty){record.status='REJECTED';record.reason='insufficient_position';book.orders.set(order.idempotencyKey,record);return record}
    book.cash+=gross-fee;book.realized+=(execPrice-pos.avgCost)*fillQty-fee;pos.qty-=fillQty;
   }
   pos.price=price;
   if(pos.qty>0)book.positions.set(order.symbol,pos);else book.positions.delete(order.symbol);
   Object.assign(record,{filledQty:fillQty,avgPrice:execPrice,fee,status:fillQty<order.qty?'PARTIALLY_FILLED':'FILLED'});
   book.fills.push({key:order.idempotencyKey,symbol:order.symbol,side,qty:fillQty,price:execPrice,fee});
  }
  book.orders.set(order.idempotencyKey,record);
  return {...record};
 }
 function cancel(key){const o=book.orders.get(key);if(o&&['OPEN','PARTIALLY_FILLED'].includes(o.status))o.status=o.filledQty>0?'PARTIALLY_FILLED_CANCELLED':'CANCELLED';return o?{...o}:null}
 function resolveUnknown(key,resolved){const o=book.orders.get(key);if(o&&o.status==='UNKNOWN')Object.assign(o,resolved);return o?{...o}:null}
 function snapshot(){return {cash:book.cash,realizedPnl:book.realized,positions:[...book.positions.values()].map(p=>({...p})),orders:[...book.orders.values()].map(o=>({...o})),fills:book.fills.map(f=>({...f}))}}
 return {submit,cancel,resolveUnknown,getOrder:key=>book.orders.has(key)?{...book.orders.get(key)}:null,snapshot};
}

// Compare the internal ledger with what the broker reports. Any drift halts new orders.
export function reconcileLedger(ledger={},broker={},tolerance=1){
 const diffs=[];
 if(Math.abs(Number(ledger.cash||0)-Number(broker.cash||0))>tolerance)diffs.push({field:'cash',ledger:ledger.cash,broker:broker.cash});
 const map=list=>new Map((list||[]).map(p=>[p.symbol,Number(p.qty||0)]));
 const a=map(ledger.positions),b=map(broker.positions);
 for(const symbol of new Set([...a.keys(),...b.keys()]))if(Math.abs((a.get(symbol)||0)-(b.get(symbol)||0))>1e-9)diffs.push({field:'position',symbol,ledger:a.get(symbol)||0,broker:b.get(symbol)||0});
 const unknown=(broker.orders||[]).filter(o=>o.status==='UNKNOWN').map(o=>o.key);
 return {reconciled:diffs.length===0&&unknown.length===0,diffs,unknownOrders:unknown};
}

// ---- Backtesting ----
// prices: {SYMBOL:[close,...]} aligned on the same trading days. Signals use data up to the previous day only.
export const STRATEGIES=Object.freeze({
 static_rebalance:{id:'static_rebalance',label:'정기 리밸런싱 (고정 비중)'},
 trend_filter:{id:'trend_filter',label:'추세 필터 (이동평균 위에서만 보유)'},
 vol_target:{id:'vol_target',label:'변동성 기반 위험 조절'}
});

function sma(series,end,n){if(end<n)return null;let s=0;for(let i=end-n;i<end;i++)s+=series[i];return s/n}
function stdev(values){if(values.length<2)return 0;const m=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((a,b)=>a+(b-m)**2,0)/(values.length-1))}

export function strategyWeights(strategy,prices,t){
 const symbols=Object.keys(strategy.weights||{});
 const out={};
 for(const s of symbols){
  const w=strategy.weights[s];const series=prices[s];
  if(strategy.id==='trend_filter'){const avg=sma(series,t,strategy.lookback||120);out[s]=avg!==null&&series[t-1]>avg?w:0}
  else if(strategy.id==='vol_target'){
   const look=strategy.lookback||60;
   if(t<=look){out[s]=0;continue}
   const rets=[];for(let i=t-look;i<t-1;i++)rets.push(series[i+1]/series[i]-1);
   const vol=stdev(rets)*Math.sqrt(252);
   out[s]=vol>0?Math.min(w,w*(strategy.targetVol||0.12)/vol):w;
  }
  else out[s]=w;
 }
 return out;
}

export function runBacktest({prices,strategy,initialCash=10_000_000,feeRate=0.00015,slippageBps=10,rebalanceEvery=21,start=0,end}={}){
 const symbols=Object.keys(strategy.weights||{});
 const len=Math.min(...symbols.map(s=>prices[s].length));
 const last=Math.min(end??len,len);
 let cash=initialCash;const qty=Object.fromEntries(symbols.map(s=>[s,0]));
 const equity=[];let costs=0,turnover=0,trades=0;
 for(let t=start;t<last;t++){
  const value=()=>cash+symbols.reduce((a,s)=>a+qty[s]*prices[s][t],0);
  if((t-start)%rebalanceEvery===0&&t>start){
   const target=strategyWeights(strategy,prices,t);
   const total=value();
   for(const s of symbols){
    const want=total*(target[s]||0)/prices[s][t];
    const delta=want-qty[s];
    if(Math.abs(delta*prices[s][t])<total*0.001)continue;
    const px=prices[s][t]*(1+Math.sign(delta)*slippageBps/10000);
    const gross=Math.abs(delta)*px,fee=gross*feeRate;
    cash-=delta*px+fee;qty[s]+=delta;costs+=fee+Math.abs(delta)*prices[s][t]*slippageBps/10000;turnover+=gross;trades++;
   }
  }
  equity.push(value());
 }
 return {equity,costs,turnover,trades,metrics:performanceMetrics(equity,initialCash)};
}

export function performanceMetrics(equity,initial=equity[0]){
 if(!equity.length)return null;
 const rets=[];for(let i=1;i<equity.length;i++)rets.push(equity[i]/equity[i-1]-1);
 let peak=equity[0],mdd=0;for(const v of equity){peak=Math.max(peak,v);mdd=Math.max(mdd,(peak-v)/peak)}
 const years=Math.max(equity.length/252,1/252);
 const total=equity[equity.length-1]/initial-1;
 const vol=stdev(rets)*Math.sqrt(252);
 const mean=rets.length?rets.reduce((a,b)=>a+b,0)/rets.length*252:0;
 const gains=rets.filter(r=>r>0).reduce((a,b)=>a+b,0),losses=-rets.filter(r=>r<0).reduce((a,b)=>a+b,0);
 return {totalReturn:total,cagr:Math.sign(1+total)*Math.abs(1+total)**(1/years)-1,annualVol:vol,maxDrawdown:mdd,sharpe:vol>0?mean/vol:0,profitFactor:losses>0?gains/losses:(gains>0?Infinity:0),days:equity.length};
}

// Walk-forward: parameters are fixed beforehand; only the out-of-sample segment counts toward acceptance.
export function walkForwardEvaluate({prices,strategy,benchmark,splitRatio=0.6,...opts}){
 const len=Math.min(...Object.values(prices).map(s=>s.length));
 const split=Math.floor(len*splitRatio);
 const inSample=runBacktest({prices,strategy,...opts,start:0,end:split});
 const outSample=runBacktest({prices,strategy,...opts,start:split,end:len});
 const bench=benchmark?runBacktest({prices,strategy:benchmark,...opts,start:split,end:len}):null;
 return {inSample:inSample.metrics,outOfSample:outSample.metrics,benchmark:bench?.metrics||null,costs:outSample.costs,trades:outSample.trades};
}

export const DEFAULT_ACCEPTANCE=Object.freeze({minOutOfSampleSharpe:0.3,maxDrawdownPct:null,minProfitFactor:1.05,maxUnderperformBenchmarkPct:5,minPaperDays:60,minStressScenarios:4});

export function evaluateStrategyAcceptance({walkForward,stress=[],paper={},policy={},criteria=DEFAULT_ACCEPTANCE}){
 const failures=[];
 const oos=walkForward?.outOfSample;
 const mddLimit=(criteria.maxDrawdownPct??policy.totalLossLimitPct??20)/100;
 if(!oos)failures.push('no_out_of_sample');
 else{
  if(oos.sharpe<criteria.minOutOfSampleSharpe)failures.push('oos_sharpe_low');
  if(oos.maxDrawdown>mddLimit)failures.push('oos_drawdown_exceeds_limit');
  if(oos.profitFactor<criteria.minProfitFactor)failures.push('profit_factor_low');
  const bench=walkForward.benchmark;
  if(bench&&(bench.totalReturn-oos.totalReturn)*100>criteria.maxUnderperformBenchmarkPct)failures.push('underperforms_benchmark');
 }
 if(stress.length<criteria.minStressScenarios)failures.push('stress_scenarios_insufficient');
 for(const s of stress)if(s.metrics.maxDrawdown>mddLimit*1.5)failures.push('stress_drawdown_'+s.name);
 if(Number(paper.days||0)<criteria.minPaperDays)failures.push('paper_period_insufficient');
 if(paper.limitViolations>0)failures.push('paper_limit_violations');
 return {passed:failures.length===0,failures,criteria:{...criteria,maxDrawdownPct:mddLimit*100}};
}

// Deterministic synthetic regimes for stress testing. These are not market history.
export function syntheticRegime(name,days=252,seed=7){
 let s=seed>>>0;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};
 const gauss=()=>Math.sqrt(-2*Math.log(rand()+1e-12))*Math.cos(2*Math.PI*rand());
 const spec={bull:[0.12,0.15],bear:[-0.25,0.25],sideways:[0,0.12],crash:[-0.6,0.45],recovery:[0.3,0.3]}[name]||[0,0.15];
 const out=[100];
 for(let i=1;i<days;i++){
  const drift=name==='crash'&&i>days*0.2&&i<days*0.35?spec[0]*3:spec[0];
  out.push(Math.max(0.01,out[i-1]*(1+drift/252+spec[1]/Math.sqrt(252)*gauss())));
 }
 return out;
}

export function stressTestStrategy(strategy,opts={}){
 const names=['bull','bear','sideways','crash','recovery'];
 return names.map((name,i)=>{
  const prices=Object.fromEntries(Object.keys(strategy.weights).map((sym,j)=>[sym,syntheticRegime(name,opts.days||252,11+i*31+j*7)]));
  return {name,synthetic:true,metrics:runBacktest({prices,strategy,...opts}).metrics};
 });
}

// ---- Scheduling ----
// Reports are due Monday 08:00 KST (weekly, previous Mon-Sun) and the 1st 08:00 KST (monthly, previous month).
const KST=9*3600e3,DAY=86400e3;
export const kstDay=ms=>new Date(ms+KST).toISOString().slice(0,10);
export function autopilotReportPeriods(now){
 const kst=now+KST;
 const midnight=kst-((kst%DAY)+DAY)%DAY-KST;
 let monday=midnight-((new Date(kst).getUTCDay()+6)%7)*DAY;
 if(now<monday+8*3600e3)monday-=7*DAY;
 const d=new Date(kst);let y=d.getUTCFullYear(),m=d.getUTCMonth();
 if(now<Date.UTC(y,m,1)-KST+8*3600e3)m-=1;
 const monthEnd=Date.UTC(y,m,1)-KST,monthStart=Date.UTC(y,m-1,1)-KST;
 return [
  {kind:'weekly',start:monday-7*DAY,end:monday,key:'W:'+kstDay(monday-7*DAY)},
  {kind:'monthly',start:monthStart,end:monthEnd,key:'M:'+kstDay(monthStart).slice(0,7)}
 ];
}

// series: [{day,equity}] ascending. base: equity at the close before the period (falls back to the first point).
export function periodPerformance(series=[],base){
 if(!series.length)return {periodReturn:undefined,maxDrawdown:undefined,points:0};
 const start=Number(base)>0?Number(base):Number(series[0].equity);
 let peak=start,mdd=0;
 for(const p of series){peak=Math.max(peak,p.equity);mdd=Math.max(mdd,(peak-p.equity)/peak)}
 return {periodReturn:series[series.length-1].equity/start-1,maxDrawdown:mdd,points:series.length};
}

// ---- Reporting ----
const won=n=>Number.isFinite(Number(n))?Math.round(Number(n)).toLocaleString('ko-KR')+'원':'확인 필요';
const pct=n=>Number.isFinite(Number(n))?(Number(n)*100).toFixed(2)+'%':'확인 필요';
export function buildAutopilotReport(kind,snapshot={}){
 const s=snapshot;
 const budget=Number(s.policy?.totalBudget||0);
 const lines=kind==='monthly'?[
  ['월간 순수익률',pct(s.monthReturn??s.periodReturn)],['누적 수익률',pct(s.cumulativeReturn)],['최대낙폭',pct(s.maxDrawdown)],
  ['수수료·세금·환율 영향',won(s.costs)],['자산배분 상태',s.allocationSummary||'확인 필요'],['장기 목표 대비',s.goalProgress||'확인 필요']
 ]:[
  ['총 투자자산',won(s.equity)],['주간 수익률',pct(s.periodReturn)],['평가손익',won(s.unrealizedPnl)],['실현손익',won(s.realizedPnl)],
  ['투자한도 사용률',budget?pct(Number(s.committed||0)/budget):'한도 미설정'],['벤치마크 대비',pct(s.excessReturn)],
  ['이번 주 거래',`${Number(s.tradeCount||0)}건`],['위험 상태',s.riskState||'정상'],['다음 주 점검',s.nextChecks?.join(', ')||'없음']
 ];
 return {
  schema:'ekodi.invest.autopilot-report.v1',kind,generatedAt:new Date(Number(s.now??Date.now())).toISOString(),
  period:s.period?{start:new Date(s.period.start).toISOString(),end:new Date(s.period.end).toISOString(),key:s.period.key}:null,
  dataBasis:s.dataBasis||'paper',
  state:s.state||AUTOPILOT_DEFAULT_STATE,
  lines:lines.map(([label,value])=>({label,value})),
  ownerDecisionsNeeded:s.decisions||[],
  disclaimer:'과거·모의 성과는 미래 수익을 보장하지 않습니다. 급락·거래정지·가격 급변 시 실제 손실이 설정 한도를 넘을 수 있습니다.'
 };
}

// Toss Securities Open API facts read from the official spec on 2026-10-25
// (openapi.tossinvest.com/openapi-docs/latest/openapi.json v1.2.24, overview.md, faq.md). Docs only: no live response verified yet.
export const AUTOPILOT_BROKER_STATUS=Object.freeze({
 primary:'toss',
 adapter:BROKER_ADAPTERS.toss,
 docsReviewedAt:'2026-10-25',
 docsSpecVersion:'1.2.24',
 officialPaperEnvironment:false,
 paperEngine:'ekodi',
 endpointsVerified:false,
 readOnlyAdapterEnabled:false,
 orderAdapterEnabled:false,
 requirements:['본인 토스증권 계좌에서 client_id·client_secret 발급','허용 IP 등록 (Cloudflare Workers는 고정 출구 IP가 없어 고정 IP 중계가 필요)','access token 24시간, refresh token 없음, client당 유효 토큰 1개','계좌·주문 API는 X-Tossinvest-Account 헤더 필요'],
 note:'공식 문서·실제 API 응답으로 확인한 엔드포인트만 연결합니다. 확인 전에는 조회·주문 어댑터를 활성화하지 않습니다.'
});
