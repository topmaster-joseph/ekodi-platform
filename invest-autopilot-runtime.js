// /v1/invest/autopilot/*: owner-only autopilot policy, operating state, paper trading, emergency stop and reports.
// Live orders are never submitted from here; the Risk Engine runs on every paper order and LIVE_ACTIVE stays gated.
import { resolveWorkspacePrincipal, auditPrincipal } from './ekodi-principal.js';
import { cors, json } from './invest-automation-runtime.js';
import {
 AUTOPILOT_DEFAULT_STATE,AUTOPILOT_POLICY_FIELDS,AUTOPILOT_HARD_LIMITS,ALLOCATION_EXAMPLE,AUTOPILOT_BROKER_STATUS,DEFAULT_ACCEPTANCE,
 investOwnerEmail,emptyAutopilotPolicy,normalizeAutopilotPolicy,missingPolicyFields,policyFingerprint,policyChangeRequiresReapproval,
 transitionAutopilotState,evaluateLiveActivation,evaluateAutopilotOrder,evaluateAutopilotSentinel,createPaperBroker,buildAutopilotReport
} from './invest-autopilot-core.js';

const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const tradeDay=ms=>new Date(ms+9*3600e3).toISOString().slice(0,10);
const parse=(text,fallback)=>{try{const v=JSON.parse(text||'');return v??fallback}catch{return fallback}};
async function body(request){try{return await request.json()}catch{return null}}
const FILLED=['FILLED','PARTIALLY_FILLED','PARTIALLY_FILLED_CANCELLED'];

async function ownerContext(request,env,write){
 const ctx=await resolveWorkspacePrincipal(request,env,{write});
 if(ctx.error)return ctx;
 if(ctx.subject?.type!=='person'||String(ctx.identity?.email||'').toLowerCase()!==investOwnerEmail(env))return {error:'OWNER_ONLY',status:403};
 return ctx;
}

async function loadAccount(env,ctx){
 let row=await env.DB.prepare(`SELECT * FROM investment_autopilot_accounts WHERE subject_type=? AND subject_key=?`).bind(ctx.subject.type,ctx.subject.key).first();
 if(!row){
  const now=nowIso();
  await env.DB.prepare(`INSERT OR IGNORE INTO investment_autopilot_accounts(subject_type,subject_key,state,policy_json,created_at,updated_at) VALUES(?,?,?,?,?,?)`).bind(ctx.subject.type,ctx.subject.key,AUTOPILOT_DEFAULT_STATE,JSON.stringify(emptyAutopilotPolicy()),now,now).run();
  row=await env.DB.prepare(`SELECT * FROM investment_autopilot_accounts WHERE subject_type=? AND subject_key=?`).bind(ctx.subject.type,ctx.subject.key).first();
 }
 const policy={...emptyAutopilotPolicy(),...parse(row?.policy_json,{})};
 return {row,state:row?.state||AUTOPILOT_DEFAULT_STATE,resumeState:row?.resume_state||'',policy,ledger:parse(row?.paper_ledger_json,{}),liveApproval:parse(row?.live_approval_json,null),disclosureAckAt:row?.disclosure_ack_at||'',paperStartedAt:row?.paper_started_at||''};
}

async function saveAccount(env,ctx,fields){
 const sets=[],values=[];
 for(const [column,value] of Object.entries(fields)){sets.push(`${column}=?`);values.push(value)}
 sets.push('updated_by=?','updated_at=?');values.push(ctx.identity.email,nowIso());
 await env.DB.prepare(`UPDATE investment_autopilot_accounts SET ${sets.join(',')} WHERE subject_type=? AND subject_key=?`).bind(...values,ctx.subject.type,ctx.subject.key).run();
}

async function recordEvent(env,ctx,type,severity='info',payload={}){
 await env.DB.prepare(`INSERT INTO investment_autopilot_events(subject_type,subject_key,event_type,severity,payload_json,created_at) VALUES(?,?,?,?,?,?)`).bind(ctx.subject.type,ctx.subject.key,clean(type,80),severity,JSON.stringify(payload).slice(0,4000),nowIso()).run();
}

function ledgerView(ledger,now=Date.now()){
 const positions=Array.isArray(ledger.positions)?ledger.positions:[];
 const marketValue=positions.reduce((s,p)=>s+Number(p.qty||0)*Number(p.price||0),0);
 const cash=Number(ledger.cash||0),equity=cash+marketValue;
 const day=tradeDay(now);
 const dayStartEquity=ledger.dayKey===day?Number(ledger.dayStartEquity||equity):equity;
 return {cash,positions,marketValue,equity,startEquity:Number(ledger.startEquity||0),dayStartEquity,dayKey:day,realizedPnl:Number(ledger.realizedPnl||0),
  unrealizedPnl:positions.reduce((s,p)=>s+(Number(p.price||0)-Number(p.avgCost||0))*Number(p.qty||0),0)};
}

async function dayStats(env,ctx,day){
 const row=await env.DB.prepare(`SELECT
   COALESCE(SUM(CASE WHEN side='BUY' AND status IN ('FILLED','PARTIALLY_FILLED','PARTIALLY_FILLED_CANCELLED') THEN filled_qty*avg_price+fee ELSE 0 END),0) AS buy_amount,
   COALESCE(SUM(CASE WHEN status<>'RISK_BLOCKED' THEN 1 ELSE 0 END),0) AS trades,
   COALESCE(SUM(CASE WHEN status='UNKNOWN' THEN 1 ELSE 0 END),0) AS unknown
   FROM investment_autopilot_orders WHERE subject_type=? AND subject_key=? AND trade_day=?`).bind(ctx.subject.type,ctx.subject.key,day).first();
 return {buyAmountToday:Number(row?.buy_amount||0),tradesToday:Number(row?.trades||0),unknown:Number(row?.unknown||0)};
}

async function paperValidation(env,ctx,account,now=Date.now()){
 const days=account.paperStartedAt?Math.floor((now-Date.parse(account.paperStartedAt))/86400e3):0;
 const critical=await env.DB.prepare(`SELECT COUNT(*) AS n FROM investment_autopilot_events WHERE subject_type=? AND subject_key=? AND severity='critical' AND event_type LIKE 'sentinel:%'`).bind(ctx.subject.type,ctx.subject.key).first();
 const failures=[];
 if(days<DEFAULT_ACCEPTANCE.minPaperDays)failures.push('paper_period_insufficient');
 if(Number(critical?.n||0)>0)failures.push('paper_limit_violations');
 // Strategy acceptance (walk-forward on verified history + stress) is not wired to a verified data source yet.
 failures.push('strategy_acceptance_not_recorded');
 return {passed:failures.length===0,days,failures,minPaperDays:DEFAULT_ACCEPTANCE.minPaperDays};
}

function liveGates(account,validation){
 // Owner/broker gates are false until a governed release verifies them server-side.
 return {policy:account.policy,liveApproval:account.liveApproval,paperValidation:validation,disclosureAcknowledgedAt:account.disclosureAckAt,
  accountOwnershipVerified:false,brokerAutomationTermsVerified:false,brokerOrderApiVerified:false,riskEngineHealthy:true,envLiveApproved:false};
}

async function runSentinel(env,ctx,account,now=Date.now()){
 const view=ledgerView(account.ledger,now);
 const result=evaluateAutopilotSentinel({policy:account.policy,now,equity:view.equity,dayStartEquity:view.dayStartEquity,startEquity:view.startEquity,committed:view.marketValue,brokerHealthy:true,ledgerReconciled:true,riskEngineHealthy:true});
 if(result.haltNewOrders&&account.state==='PAPER_TRADING'){
  await saveAccount(env,ctx,{state:'PAUSED',resume_state:'PAPER_TRADING'});
  await recordEvent(env,ctx,'sentinel:auto_pause','critical',{alerts:result.alerts});
  account.state='PAUSED';account.resumeState='PAPER_TRADING';
 }
 return result;
}

async function status(request,env,ctx){
 const account=await loadAccount(env,ctx),now=Date.now();
 const sentinel=await runSentinel(env,ctx,account,now);
 const validation=await paperValidation(env,ctx,account,now);
 const live=evaluateLiveActivation(liveGates(account,validation));
 const view=ledgerView(account.ledger,now);
 const orders=await env.DB.prepare(`SELECT idempotency_key,mode,symbol,side,qty,limit_price,status,filled_qty,avg_price,fee,risk_reasons_json,quote_source,created_at FROM investment_autopilot_orders WHERE subject_type=? AND subject_key=? ORDER BY id DESC LIMIT 20`).bind(ctx.subject.type,ctx.subject.key).all();
 const events=await env.DB.prepare(`SELECT event_type,severity,payload_json,created_at FROM investment_autopilot_events WHERE subject_type=? AND subject_key=? ORDER BY id DESC LIMIT 20`).bind(ctx.subject.type,ctx.subject.key).all();
 await auditPrincipal(env,ctx.principal,'invest:autopilot-status');
 return json(request,env,{
  schema:'ekodi.invest.autopilot-status.v1',
  state:account.state,resumeState:account.resumeState,
  policy:account.policy,policyMissing:missingPolicyFields(account.policy),policyFingerprint:policyFingerprint(account.policy),
  policyFields:Object.fromEntries(Object.entries(AUTOPILOT_POLICY_FIELDS).map(([k,v])=>[k,{label:v.label,type:v.type,values:v.values||null,min:v.min??null,max:v.max??null}])),
  hardLimits:AUTOPILOT_HARD_LIMITS,allocationExample:ALLOCATION_EXAMPLE,
  paper:{...view,startedAt:account.paperStartedAt,returnPct:view.startEquity>0?view.equity/view.startEquity-1:null,validation,dataBasis:'paper_owner_supplied_quotes'},
  sentinel,liveActivation:{eligible:live.eligible,blockers:live.blockers},disclosureAcknowledgedAt:account.disclosureAckAt,
  broker:AUTOPILOT_BROKER_STATUS,
  orders:(orders.results||[]).map(o=>({...o,risk_reasons:parse(o.risk_reasons_json,[]),risk_reasons_json:undefined})),
  events:(events.results||[]).map(e=>({...e,payload:parse(e.payload_json,{}),payload_json:undefined})),
  execution:{liveOrders:false,reason:'LIVE_EXECUTION_REQUIRES_SEPARATE_GOVERNED_APPROVAL'}
 });
}

async function updatePolicy(request,env,ctx){
 const data=await body(request);if(!data||typeof data.policy!=='object')return json(request,env,{error:'INVALID_JSON'},400);
 const {policy,errors,valid}=normalizeAutopilotPolicy({...data.policy,paidAlertCostApproved:false});
 if(!valid)return json(request,env,{error:'POLICY_INVALID',errors},400);
 const account=await loadAccount(env,ctx);
 const fields={policy_json:JSON.stringify(policy),policy_fingerprint:policyFingerprint(policy)};
 const reapproval=policyChangeRequiresReapproval(account.policy,policy);
 let state=account.state;
 if(reapproval.required&&(account.liveApproval||['LIVE_PENDING_APPROVAL','LIVE_ACTIVE'].includes(state))){
  fields.live_approval_json=null;
  if(state==='LIVE_ACTIVE'){state='PAUSED';fields.state='PAUSED';fields.resume_state='LIVE_PENDING_APPROVAL'}
 }
 if(state==='PAPER_TRADING'&&missingPolicyFields(policy).length){state='PAUSED';fields.state='PAUSED';fields.resume_state='PAPER_TRADING'}
 await saveAccount(env,ctx,fields);
 await recordEvent(env,ctx,'policy:update','info',{fingerprint:fields.policy_fingerprint,reapproval:reapproval.reasons,missing:missingPolicyFields(policy)});
 await auditPrincipal(env,ctx.principal,'invest:autopilot-policy-update');
 return json(request,env,{ok:true,state,policy,policyMissing:missingPolicyFields(policy),reapprovalRequired:reapproval.required,reapprovalReasons:reapproval.reasons});
}

async function changeState(request,env,ctx){
 const data=await body(request)||{};
 const target=clean(data.target,40);
 if(target==='EMERGENCY_STOPPED')return emergencyStop(request,env,ctx);
 const account=await loadAccount(env,ctx),now=Date.now();
 if(account.state==='EMERGENCY_STOPPED'&&data.confirm!=='RESUME_AFTER_REVIEW')return json(request,env,{error:'RESUME_CONFIRMATION_REQUIRED'},409);
 const validation=await paperValidation(env,ctx,account,now);
 const day=await dayStats(env,ctx,tradeDay(now));
 const gates={...liveGates(account,validation),reconciled:day.unknown===0};
 const result=transitionAutopilotState(account.state,target,gates);
 if(!result.ok){
  await recordEvent(env,ctx,'state:blocked','warning',{from:account.state,target,reason:result.reason,missing:result.missing||[]});
  return json(request,env,{ok:false,state:account.state,reason:result.reason,missing:result.missing||[]},409);
 }
 const fields={state:result.state,resume_state:result.state==='PAUSED'?account.state:''};
 if(result.state==='PAPER_TRADING'&&!account.paperStartedAt){
  const budget=Number(account.policy.totalBudget);
  fields.paper_ledger_json=JSON.stringify({cash:budget,positions:[],startEquity:budget,dayStartEquity:budget,dayKey:tradeDay(now),realizedPnl:0});
  fields.paper_started_at=nowIso();
 }
 await saveAccount(env,ctx,fields);
 await recordEvent(env,ctx,'state:'+result.state.toLowerCase(),'info',{from:account.state,reason:result.reason});
 await auditPrincipal(env,ctx.principal,'invest:autopilot-state');
 return json(request,env,{ok:true,state:result.state,from:account.state,reason:result.reason});
}

async function emergencyStop(request,env,ctx){
 const account=await loadAccount(env,ctx);
 const cancelled=await env.DB.prepare(`UPDATE investment_autopilot_orders SET status=CASE WHEN filled_qty>0 THEN 'PARTIALLY_FILLED_CANCELLED' ELSE 'CANCELLED' END,updated_at=? WHERE subject_type=? AND subject_key=? AND status IN ('OPEN','PARTIALLY_FILLED')`).bind(nowIso(),ctx.subject.type,ctx.subject.key).run();
 await saveAccount(env,ctx,{state:'EMERGENCY_STOPPED',resume_state:account.state==='EMERGENCY_STOPPED'?account.resumeState:account.state});
 // Mirror into the shared automation kill switch so every invest loop sees the halt.
 try{await env.DB.prepare(`UPDATE investment_policies SET state='halt',live_trading_enabled=0,updated_by=?,updated_at=? WHERE subject_type=? AND subject_key=?`).bind(ctx.identity.email,nowIso(),ctx.subject.type,ctx.subject.key).run()}catch{}
 const cancelledOpenOrders=Number(cancelled?.meta?.changes||0);
 await recordEvent(env,ctx,'emergency_stop','critical',{from:account.state,cancelledOpenOrders});
 await auditPrincipal(env,ctx.principal,'invest:autopilot-emergency-stop');
 return json(request,env,{ok:true,state:'EMERGENCY_STOPPED',from:account.state,cancelledOpenOrders,holdingsLiquidated:false});
}

async function acknowledgeDisclosure(request,env,ctx){
 const data=await body(request);
 if(data?.statement!=='RISK_AND_COST_DISCLOSURE_ACKNOWLEDGED')return json(request,env,{error:'STATEMENT_REQUIRED'},400);
 const at=nowIso();
 await saveAccount(env,ctx,{disclosure_ack_at:at});
 await recordEvent(env,ctx,'disclosure:acknowledged','info',{});
 return json(request,env,{ok:true,disclosureAcknowledgedAt:at});
}

async function paperOrder(request,env,ctx){
 const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
 const now=Date.now(),day=tradeDay(now);
 const intent={idempotencyKey:clean(data.idempotencyKey,120),symbol:clean(data.symbol,20).toUpperCase(),market:clean(data.market,8).toUpperCase(),assetType:clean(data.assetType,20).toUpperCase(),
  side:clean(data.side,4).toUpperCase(),qty:Number(data.qty),limitPrice:Number(data.limitPrice),orderType:clean(data.orderType,10).toUpperCase()||'LIMIT',
  leverage:data.leverage,margin:data.margin,derivative:data.derivative,creditOrder:data.creditOrder};
 const existing=intent.idempotencyKey?await env.DB.prepare(`SELECT idempotency_key,status,filled_qty,avg_price FROM investment_autopilot_orders WHERE subject_type=? AND subject_key=? AND idempotency_key=?`).bind(ctx.subject.type,ctx.subject.key,intent.idempotencyKey).first():null;
 if(existing)return json(request,env,{ok:true,duplicate:true,order:existing});
 const account=await loadAccount(env,ctx);
 const view=ledgerView(account.ledger,now);
 const stats=await dayStats(env,ctx,day);
 // No verified market data feed is connected yet; the owner supplies the reference quote and it is labelled as such.
 const quote={symbol:intent.symbol,price:Number(data.quote?.price),prevClose:Number(data.quote?.prevClose)||undefined,ts:Date.parse(data.quote?.at||'')||0};
 const risk=evaluateAutopilotOrder(intent,{state:account.state,policy:account.policy,now,quote,costs:{feeRate:0.00015,slippageBps:10},
  account:{cash:view.cash,positions:view.positions,openOrders:[]},ledger:{...stats,dayStartEquity:view.dayStartEquity,startEquity:view.startEquity},
  brokerHealthy:true,ledgerReconciled:true,pendingUnknownOrders:stats.unknown,seenOrderKeys:[]});
 const base=[ctx.subject.type,ctx.subject.key,intent.idempotencyKey||('blocked:'+now),'paper',intent.symbol||'?',intent.market,intent.assetType,intent.side==='SELL'?'SELL':'BUY',Number.isFinite(intent.qty)?intent.qty:0,Number.isFinite(intent.limitPrice)?intent.limitPrice:0];
 const meta=['owner_supplied',Number.isFinite(quote.price)?quote.price:0,quote.ts?new Date(quote.ts).toISOString():'',clean(data.strategyId,80),clean(data.rationale,1000),day,nowIso(),nowIso()];
 const insert=`INSERT OR IGNORE INTO investment_autopilot_orders(subject_type,subject_key,idempotency_key,mode,symbol,market,asset_type,side,qty,limit_price,status,filled_qty,avg_price,fee,risk_allowed,risk_reasons_json,quote_source,quote_price,quote_at,strategy_id,rationale,trade_day,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
 if(!risk.allowed){
  await env.DB.prepare(insert).bind(...base,'RISK_BLOCKED',0,0,0,0,JSON.stringify(risk.reasons),...meta).run();
  await recordEvent(env,ctx,'risk:blocked','warning',{symbol:intent.symbol,reasons:risk.reasons});
  return json(request,env,{ok:false,allowed:false,reasons:risk.reasons,engine:risk.engine,executionPerformed:false},422);
 }
 const broker=createPaperBroker({cash:view.cash,positions:view.positions,realizedPnl:view.realizedPnl,feeRate:0.00015,slippageBps:10});
 const order=broker.submit(intent,{price:quote.price});
 const snap=broker.snapshot();
 await env.DB.prepare(insert).bind(...base,order.status,order.filledQty||0,order.avgPrice||0,order.fee||0,1,'[]',...meta).run();
 await saveAccount(env,ctx,{paper_ledger_json:JSON.stringify({...account.ledger,cash:snap.cash,positions:snap.positions,realizedPnl:snap.realizedPnl,dayKey:view.dayKey,dayStartEquity:view.dayStartEquity})});
 await recordEvent(env,ctx,'paper:order','info',{symbol:intent.symbol,side:intent.side,status:order.status});
 await auditPrincipal(env,ctx.principal,'invest:autopilot-paper-order');
 return json(request,env,{ok:true,allowed:true,mode:'paper',order,ledger:ledgerView({...account.ledger,...snap,dayKey:view.dayKey,dayStartEquity:view.dayStartEquity},now),dataBasis:'paper_owner_supplied_quote',executionPerformed:false},201);
}

async function report(request,env,ctx){
 const kind=new URL(request.url).searchParams.get('kind')==='monthly'?'monthly':'weekly';
 const account=await loadAccount(env,ctx),now=Date.now();
 const view=ledgerView(account.ledger,now);
 const since=tradeDay(now-(kind==='monthly'?30:7)*86400e3);
 const row=await env.DB.prepare(`SELECT COUNT(*) AS trades,COALESCE(SUM(fee),0) AS fees FROM investment_autopilot_orders WHERE subject_type=? AND subject_key=? AND trade_day>=? AND status IN ('FILLED','PARTIALLY_FILLED','PARTIALLY_FILLED_CANCELLED')`).bind(ctx.subject.type,ctx.subject.key,since).first();
 const decisions=[];
 const missing=missingPolicyFields(account.policy);
 if(missing.length)decisions.push('AI 자동투자 정책 미설정 항목: '+missing.map(k=>AUTOPILOT_POLICY_FIELDS[k].label).join(', '));
 if(account.state==='EMERGENCY_STOPPED'||account.state==='PAUSED')decisions.push('운용 중지 상태입니다. 원인 확인 후 재개 여부를 결정해 주세요.');
 const result=buildAutopilotReport(kind,{now,state:account.state,policy:account.policy,equity:account.paperStartedAt?view.equity:undefined,committed:view.marketValue,
  unrealizedPnl:account.paperStartedAt?view.unrealizedPnl:undefined,realizedPnl:account.paperStartedAt?view.realizedPnl:undefined,tradeCount:Number(row?.trades||0),
  costs:Number(row?.fees||0),cumulativeReturn:view.startEquity>0?view.equity/view.startEquity-1:undefined,riskState:account.state,dataBasis:'paper',decisions,
  nextChecks:missing.length?['정책 설정 완료']:['모의투자 성과 점검']});
 await auditPrincipal(env,ctx.principal,'invest:autopilot-report');
 return json(request,env,result);
}

export async function handleInvestAutopilotApi(request,env){
 const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';
 if(!path.startsWith('/v1/invest/autopilot/'))return null;
 const {ok,headers}=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:ok?204:403,headers});
 if(!ok)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
 if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
 const write=!['GET','HEAD'].includes(request.method);
 const ctx=await ownerContext(request,env,write);if(ctx.error)return json(request,env,{error:ctx.error},ctx.status);
 if(path==='/v1/invest/autopilot/status'&&request.method==='GET')return status(request,env,ctx);
 if(path==='/v1/invest/autopilot/policy'&&request.method==='PUT')return updatePolicy(request,env,ctx);
 if(path==='/v1/invest/autopilot/state'&&request.method==='POST')return changeState(request,env,ctx);
 if(path==='/v1/invest/autopilot/emergency-stop'&&request.method==='POST')return emergencyStop(request,env,ctx);
 if(path==='/v1/invest/autopilot/disclosure'&&request.method==='POST')return acknowledgeDisclosure(request,env,ctx);
 if(path==='/v1/invest/autopilot/paper/orders'&&request.method==='POST')return paperOrder(request,env,ctx);
 if(path==='/v1/invest/autopilot/report'&&request.method==='GET')return report(request,env,ctx);
 return json(request,env,{error:'NOT_FOUND'},404);
}
