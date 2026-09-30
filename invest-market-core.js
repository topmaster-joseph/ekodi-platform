export const INVEST_PERMISSION = Object.freeze({
  READ_ONLY:'read_only',
  DRAFT_ORDER:'draft_order',
  USER_APPROVED_ORDER:'user_approved_order',
  CONDITIONAL_AUTOMATION:'conditional_automation'
});

export const BROKER_ADAPTERS = Object.freeze({
  toss:{
    id:'toss',name:'토스증권',markets:['KR','US'],
    capabilities:['quotes','positions','orders'],
    liveTradingEnabled:false,credentialMode:'user_authorized_official_api'
  },
  ibkr:{
    id:'ibkr',name:'Interactive Brokers',markets:['GLOBAL'],
    capabilities:['quotes','positions','orders'],
    liveTradingEnabled:false,credentialMode:'user_authorized_official_api'
  }
});

export function brokerDescriptor(id, overrides={}){
  const base=BROKER_ADAPTERS[id];
  if(!base)throw new Error('BROKER_NOT_REGISTERED');
  return {...base,...overrides,id:base.id,name:base.name};
}

export function aggregatePortfolio(accounts=[]){
  const result={cash:0,marketValue:0,totalValue:0,positions:[],brokers:[]};
  const brokerIds=new Set();
  for(const account of accounts){
    const cash=Number(account.cash||0), marketValue=Number(account.marketValue||0);
    result.cash+=cash; result.marketValue+=marketValue;
    brokerIds.add(String(account.brokerId||'unknown'));
    for(const position of account.positions||[]){
      result.positions.push({...position,brokerId:account.brokerId,accountId:account.accountId});
    }
  }
  result.totalValue=result.cash+result.marketValue;
  result.brokers=[...brokerIds];
  return result;
}
export function evaluateInvestmentOrder(input={}){
  const violations=[];
  const mode=input.mode==='live'?'live':'simulation';
  const broker=input.broker||{};
  const limits=input.limits||{};
  const metrics=input.metrics||{};
  const requiredCapability='orders';

  if(mode==='live'){
    if(input.permission!==INVEST_PERMISSION.USER_APPROVED_ORDER && input.permission!==INVEST_PERMISSION.CONDITIONAL_AUTOMATION) violations.push('USER_APPROVAL_REQUIRED');
    if(input.userApproved!==true && input.permission!==INVEST_PERMISSION.CONDITIONAL_AUTOMATION) violations.push('EXPLICIT_APPROVAL_REQUIRED');
    if(broker.liveTradingEnabled!==true) violations.push('BROKER_LIVE_TRADING_DISABLED');
    if(!(broker.capabilities||[]).includes(requiredCapability)) violations.push('BROKER_ORDER_CAPABILITY_MISSING');
    if(input.credentialsAuthorized!==true) violations.push('BROKER_AUTHORIZATION_REQUIRED');
  }
  if(Number(metrics.quoteAgeSeconds||0)>Number(limits.maxQuoteAgeSeconds??60)) violations.push('STALE_QUOTE');
  if(Number(metrics.projectedPositionPct||0)>Number(limits.maxPositionPct??25)) violations.push('POSITION_CONCENTRATION_LIMIT');
  if(Number(metrics.dailyLossPct||0)>Number(limits.maxDailyLossPct??5)) violations.push('DAILY_LOSS_LIMIT');
  if(Number(metrics.projectedLeverage||0)>Number(limits.maxLeverage??1)) violations.push('LEVERAGE_LIMIT');

  return {allowed:violations.length===0,mode,violations};
}

const READ_PERMISSIONS=new Set(Object.values(INVEST_PERMISSION));
const ORDER_PERMISSIONS=new Set([INVEST_PERMISSION.USER_APPROVED_ORDER,INVEST_PERMISSION.CONDITIONAL_AUTOMATION]);
const missing=(checks,ids)=>ids.filter(id=>checks[id]!==true).map(id=>`READINESS_${id.replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase()}`);

export function evaluateBrokerReadiness(input={}){
  const brokerId=String(input.brokerId||'').trim();
  const adapter=BROKER_ADAPTERS[brokerId]||null;
  const permission=String(input.permission||INVEST_PERMISSION.READ_ONLY);
  const checks={
    adapterRegistered:Boolean(adapter),
    connectionConnected:String(input.connectionStatus||'')==='connected',
    accountReferencePresent:input.accountReferencePresent===true,
    authorizationEvidencePresent:input.authorizationEvidencePresent===true,
    readPermissionReady:READ_PERMISSIONS.has(permission),
    orderPermissionReady:ORDER_PERMISSIONS.has(permission),
    quoteCapabilityReady:Boolean(adapter?.capabilities?.includes('quotes')),
    orderCapabilityReady:Boolean(adapter?.capabilities?.includes('orders')),
    marketDataReady:input.marketDataReady===true,
    marketDataFresh:input.marketDataFresh===true,
    riskPolicyReady:input.riskPolicyReady===true,
    killSwitchReady:input.killSwitchReady===true,
    auditReady:input.auditReady===true,
    selfInvestmentBoundary:input.managedInvestmentServiceEnabled!==true,
    globalLivePolicyEnabled:INVEST_MARKET_POLICY.autonomousLiveTrading===true&&input.globalLiveTradingEnabled===true,
    brokerLivePolicyEnabled:adapter?.liveTradingEnabled===true&&input.brokerLiveTradingEnabled===true
  };
  const simulationIds=['adapterRegistered','connectionConnected','accountReferencePresent','authorizationEvidencePresent','readPermissionReady','quoteCapabilityReady','marketDataReady','riskPolicyReady','killSwitchReady','auditReady','selfInvestmentBoundary'];
  const limitedLiveIds=[...simulationIds,'orderPermissionReady','orderCapabilityReady','marketDataFresh'];
  const liveIds=[...limitedLiveIds,'globalLivePolicyEnabled','brokerLivePolicyEnabled'];
  const simulationBlockers=missing(checks,simulationIds);
  const limitedLiveBlockers=missing(checks,limitedLiveIds);
  const liveBlockers=missing(checks,liveIds);
  const simulationReady=simulationBlockers.length===0;
  const limitedLivePrerequisitesReady=limitedLiveBlockers.length===0;
  const liveEligible=liveBlockers.length===0;
  return {
    schema:'ekodi.invest.broker-readiness.v1',
    brokerId,
    brokerName:adapter?.name||brokerId||'unknown',
    permission,
    simulationReady,
    limitedLivePrerequisitesReady,
    liveEligible,
    requiredMode:liveEligible?'limited_live':simulationReady?'simulation':'shadow',
    checks,
    blockers:liveBlockers,
    simulationBlockers,
    limitedLiveBlockers,
    liveBlockers,
    credentialsIncluded:false
  };
}

export function investmentCommitteeDecision(votes=[]){
  const normalized=votes.filter(v=>v&&typeof v==='object'&&v.role);
  const score=normalized.reduce((sum,v)=>sum+Number(v.score||0),0);
  const confidence=normalized.length?Math.min(1,normalized.reduce((sum,v)=>sum+Number(v.confidence||0),0)/normalized.length):0;
  return {
    decision:score>0?'consider':score<0?'avoid':'hold',
    score,confidence,
    rationale:normalized.filter(v=>v.rationale).map(v=>({role:v.role,text:v.rationale})),
    dissent:normalized.filter(v=>Number(v.score||0)<0).map(v=>v.role),
    invalidationConditions:normalized.flatMap(v=>Array.isArray(v.invalidationConditions)?v.invalidationConditions:[])
  };
}

export const AI_CIO_POLICY=Object.freeze({
  role:'AI Chief Investment Officer',
  scope:'personal-stock-portfolio',
  authorityOrder:['investment_committee','ai_cio','risk_governor','kill_switch'],
  liveExecutionAuthority:false,
  objectives:['capital_preservation','risk_adjusted_growth','liquidity','policy_compliance']
});

export function aiCioDecision({committee={},risk={},operatingState='ready',portfolio={}}={}){
  const blocked=operatingState==='halt'||operatingState==='safe_mode'||risk.allowed===false;
  const committeeDecision=String(committee.decision||'hold');
  const action=blocked?'halt':committeeDecision==='consider'?'review_for_allocation':committeeDecision==='avoid'?'avoid':'hold';
  return {
    role:AI_CIO_POLICY.role,
    action,
    executionAuthorized:false,
    operatingState,
    committeeDecision,
    riskViolations:Array.isArray(risk.violations)?risk.violations:[],
    portfolioContext:{totalValue:Number(portfolio.totalValue||0),cash:Number(portfolio.cash||0),positionCount:Array.isArray(portfolio.positions)?portfolio.positions.length:0},
    authorityOrder:AI_CIO_POLICY.authorityOrder,
    nextGate:blocked?'kill_switch_or_risk_review':'risk_governor'
  };
}

export function createInvestmentAuditEvent(type,payload={},now=()=>new Date().toISOString()){
  const allowed=['proposal','approval','rejection','simulation','execution_result'];
  if(!allowed.includes(type))throw new Error('INVALID_AUDIT_EVENT');
  return {
    schema:'ekodi.invest.audit.v1',type,at:now(),
    subjectRef:String(payload.subjectRef||''),
    brokerId:String(payload.brokerId||''),
    orderRef:String(payload.orderRef||''),
    rationaleRef:String(payload.rationaleRef||''),
    result:payload.result??null
  };
}

export const INVEST_MARKET_POLICY=Object.freeze({
  canonicalPath:'/invest',
  defaultMode:'simulation',
  autonomousLiveTrading:false,
  managedInvestmentServiceEnabled:false,
  credentialsPersistedByCore:false,
  humanApprovalRequiredForLiveOrders:true
});
