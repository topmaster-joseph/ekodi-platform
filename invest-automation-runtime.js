import { resolveWorkspacePrincipal, auditPrincipal } from './ekodi-principal.js';
import { AI_CIO_POLICY, BROKER_ADAPTERS, INVEST_MARKET_POLICY, INVEST_PERMISSION, evaluateBrokerReadiness, evaluateInvestmentOrder } from './invest-market-core.js';

const MODES=new Set(['shadow','simulation']);
const ASSET_CLASSES=new Set(['stock','bond','real_estate','fund','alternative','portfolio']);
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const num=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};
function cors(request,env){const origin=String(request.headers.get('origin')||'');const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);const ok=!origin||allowed.includes(origin);const headers={'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-max-age':'86400',vary:'Origin'};if(origin&&ok)headers['access-control-allow-origin']=origin;return {ok,headers}}
function json(request,env,data,status=200){const {headers}=cors(request,env);return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}})}
async function body(request){try{return await request.json()}catch{return null}}
const nowIso=()=>new Date().toISOString();

export const INVEST_AUTOMATION_LOOP=Object.freeze([
  'market_watch','opportunity_discovery','specialist_analysis','dissent_review','allocation','risk_governor','execution_gate','fill_monitor','performance_review','rebalance'
]);

async function ensurePolicy(env,ctx){
  const row=await env.DB.prepare(`SELECT * FROM investment_policies WHERE subject_type=? AND subject_key=?`).bind(ctx.subject.type,ctx.subject.key).first();
  if(row)return row;
  const now=nowIso();
  await env.DB.prepare(`INSERT INTO investment_policies(subject_type,subject_key,mode,state,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(ctx.subject.type,ctx.subject.key,'shadow','ready',ctx.identity.email,now,now).run();
  return env.DB.prepare(`SELECT * FROM investment_policies WHERE subject_type=? AND subject_key=?`).bind(ctx.subject.type,ctx.subject.key).first();
}

function publicPolicy(row,env){
  const approved=String(env.INVEST_LIVE_TRADING_APPROVED||'').toLowerCase()==='true';
  return {mode:row?.mode||'shadow',state:row?.state||'ready',maxPositionPct:Number(row?.max_position_pct??10),maxDailyLossPct:Number(row?.max_daily_loss_pct??2),maxLeverage:Number(row?.max_leverage??1),minCashPct:Number(row?.min_cash_pct??10),liveTradingEnabled:Boolean(Number(row?.live_trading_enabled||0)&&approved)};
}
async function brokerConnectionRows(env,ctx){
  const result=await env.DB.prepare(`SELECT id,broker_id,permission_mode,status,updated_at,CASE WHEN account_ref<>'' THEN 1 ELSE 0 END AS account_ref_present,CASE WHEN credential_ref<>'' THEN 1 ELSE 0 END AS authorization_evidence_present FROM investment_broker_connections WHERE subject_type=? AND subject_key=? ORDER BY broker_id,id`).bind(ctx.subject.type,ctx.subject.key).all();
  return result.results||[];
}
function publicBrokerRows(rows=[]){
  return rows.map(row=>({connectionId:Number(row.id||0),brokerId:String(row.broker_id||''),permissionMode:String(row.permission_mode||INVEST_PERMISSION.READ_ONLY),status:String(row.status||'disconnected'),accountReferencePresent:Boolean(Number(row.account_ref_present||0)),authorizationEvidencePresent:Boolean(Number(row.authorization_evidence_present||0)),updatedAt:row.updated_at||null}));
}
function brokerReadinessRows(policy,rows,env){
  const publicRows=publicBrokerRows(rows),results=[];
  const seen=new Set();
  const add=(brokerId,row=null)=>{
    seen.add(brokerId);
    const status=row?.status||'disconnected';
    const readiness=evaluateBrokerReadiness({
      brokerId,
      connectionStatus:status,
      accountReferencePresent:row?.accountReferencePresent===true,
      authorizationEvidencePresent:row?.authorizationEvidencePresent===true,
      permission:row?.permissionMode||INVEST_PERMISSION.READ_ONLY,
      marketDataReady:status==='connected',
      marketDataFresh:false,
      riskPolicyReady:['ready','caution'].includes(String(policy.state||'')),
      killSwitchReady:true,
      auditReady:Boolean(env?.DB),
      managedInvestmentServiceEnabled:INVEST_MARKET_POLICY.managedInvestmentServiceEnabled,
      globalLiveTradingEnabled:policy.liveTradingEnabled===true,
      brokerLiveTradingEnabled:BROKER_ADAPTERS[brokerId]?.liveTradingEnabled===true
    });
    results.push({...readiness,connectionId:row?.connectionId||null,connectionStatus:status,updatedAt:row?.updatedAt||null,evidence:{accountReferencePresent:row?.accountReferencePresent===true,authorizationEvidencePresent:row?.authorizationEvidencePresent===true,marketDataFreshness:'probe_required',rawCredentialsExposed:false}});
  };
  for(const row of publicRows)add(row.brokerId,row);
  for(const brokerId of Object.keys(BROKER_ADAPTERS))if(!seen.has(brokerId))add(brokerId);
  return results;
}
async function readinessPayload(env,ctx){
  const policy=publicPolicy(await ensurePolicy(env,ctx),env);
  const rows=await brokerConnectionRows(env,ctx);
  return {policy,brokers:publicBrokerRows(rows),readiness:brokerReadinessRows(policy,rows,env)};
}
async function automationStatus(request,env,ctx){
  const policy=await ensurePolicy(env,ctx);
  const strategies=await env.DB.prepare(`SELECT id,name,asset_class,status,updated_at FROM investment_strategies WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 100`).bind(ctx.subject.type,ctx.subject.key).all();
  const brokerRows=await brokerConnectionRows(env,ctx);
  const lastCycle=await env.DB.prepare(`SELECT id,mode,status,started_at,completed_at FROM investment_cycles WHERE subject_type=? AND subject_key=? ORDER BY id DESC LIMIT 1`).bind(ctx.subject.type,ctx.subject.key).first();
  await auditPrincipal(env,ctx.principal,'invest:automation-status');
  const strategyRows=strategies.results||[],safePolicy=publicPolicy(policy,env),brokers=publicBrokerRows(brokerRows);
  return json(request,env,{subject:ctx.subject,policy:safePolicy,strategyCount:strategyRows.length,stockStrategyCount:strategyRows.filter(item=>item.asset_class==='stock').length,strategies:strategyRows,brokers,brokerReadiness:brokerReadinessRows(safePolicy,brokerRows,env),lastCycle:lastCycle||null,loop:INVEST_AUTOMATION_LOOP,aiCio:{role:AI_CIO_POLICY.role,scope:AI_CIO_POLICY.scope,authorityOrder:AI_CIO_POLICY.authorityOrder,liveExecutionAuthority:AI_CIO_POLICY.liveExecutionAuthority,objectives:AI_CIO_POLICY.objectives},execution:{liveOrders:false,reason:'LIVE_EXECUTION_REQUIRES_SEPARATE_APPROVAL_AND_BROKER_AUTHORIZATION'}});
}
async function brokerReadinessStatus(request,env,ctx){
  const payload=await readinessPayload(env,ctx);
  await auditPrincipal(env,ctx.principal,'invest:broker-readiness');
  return json(request,env,{subject:ctx.subject,...payload,execution:{performed:false,liveOrders:false,reason:'READINESS_ONLY_LIVE_EXECUTION_DISABLED'}});
}

async function updatePolicy(request,env,ctx){
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const mode=clean(data.mode,40)||'shadow';if(!MODES.has(mode))return json(request,env,{error:'MODE_NOT_ALLOWED'},400);
  const current=await ensurePolicy(env,ctx),now=nowIso();
  const values={maxPositionPct:num(data.maxPositionPct,current.max_position_pct,0.1,100),maxDailyLossPct:num(data.maxDailyLossPct,current.max_daily_loss_pct,0.1,100),maxLeverage:num(data.maxLeverage,current.max_leverage,0,5),minCashPct:num(data.minCashPct,current.min_cash_pct,0,100)};
  await env.DB.prepare(`UPDATE investment_policies SET mode=?,max_position_pct=?,max_daily_loss_pct=?,max_leverage=?,min_cash_pct=?,live_trading_enabled=0,updated_by=?,updated_at=? WHERE subject_type=? AND subject_key=?`).bind(mode,values.maxPositionPct,values.maxDailyLossPct,values.maxLeverage,values.minCashPct,ctx.identity.email,now,ctx.subject.type,ctx.subject.key).run();
  await auditPrincipal(env,ctx.principal,'invest:automation-policy-update');
  return json(request,env,{ok:true,policy:{mode,state:current.state||'ready',...values,liveTradingEnabled:false}});
}

async function setAutomationState(request,env,ctx,state){
  const current=await ensurePolicy(env,ctx),now=nowIso();
  const safeMode=MODES.has(current.mode)?current.mode:'shadow';
  await env.DB.prepare(`UPDATE investment_policies SET mode=?,state=?,live_trading_enabled=0,updated_by=?,updated_at=? WHERE subject_type=? AND subject_key=?`).bind(safeMode,state,ctx.identity.email,now,ctx.subject.type,ctx.subject.key).run();
  await auditPrincipal(env,ctx.principal,state==='halt'?'invest:automation-halt':'invest:automation-resume');
  return json(request,env,{ok:true,policy:{...publicPolicy({...current,mode:safeMode,state,live_trading_enabled:0},env),state},executionPerformed:false});
}

async function listStrategies(request,env,ctx){
  const rows=await env.DB.prepare(`SELECT id,name,asset_class,status,policy_json,created_at,updated_at FROM investment_strategies WHERE subject_type=? AND subject_key=? ORDER BY updated_at DESC LIMIT 100`).bind(ctx.subject.type,ctx.subject.key).all();
  return json(request,env,{subject:ctx.subject,strategies:(rows.results||[]).map(row=>({...row,policy:JSON.parse(row.policy_json||'{}')}))});
}

async function createStrategy(request,env,ctx){
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const name=clean(data.name,160),assetClass=clean(data.assetClass,40),status=clean(data.status,30)||'shadow';
  if(!name)return json(request,env,{error:'NAME_REQUIRED'},400);
  if(!ASSET_CLASSES.has(assetClass))return json(request,env,{error:'ASSET_CLASS_NOT_ALLOWED'},400);
  if(!['draft','shadow','simulation'].includes(status))return json(request,env,{error:'STATUS_NOT_ALLOWED'},400);
  const now=nowIso(),policy=JSON.stringify(data.policy&&typeof data.policy==='object'?data.policy:{});
  const inserted=await env.DB.prepare(`INSERT INTO investment_strategies(subject_type,subject_key,asset_class,name,status,policy_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(ctx.subject.type,ctx.subject.key,assetClass,name,status,policy,ctx.identity.email,now,now).run();
  await auditPrincipal(env,ctx.principal,'invest:strategy-create');
  return json(request,env,{ok:true,strategyId:Number(inserted.meta?.last_row_id||0),status},201);
}

async function riskCheck(request,env,ctx){
  const data=await body(request);if(!data)return json(request,env,{error:'INVALID_JSON'},400);
  const policy=publicPolicy(await ensurePolicy(env,ctx),env);
  const brokerId=clean(data.brokerId,80),base=BROKER_ADAPTERS[brokerId]||{id:brokerId,capabilities:[],liveTradingEnabled:false};
  const broker={...base,liveTradingEnabled:Boolean(policy.liveTradingEnabled&&base.liveTradingEnabled)};
  const result=evaluateInvestmentOrder({mode:data.mode,permission:data.permission||INVEST_PERMISSION.READ_ONLY,userApproved:data.userApproved===true,credentialsAuthorized:data.credentialsAuthorized===true,broker,limits:{maxPositionPct:policy.maxPositionPct,maxDailyLossPct:policy.maxDailyLossPct,maxLeverage:policy.maxLeverage,maxQuoteAgeSeconds:60},metrics:data.metrics||{}});
  await auditPrincipal(env,ctx.principal,'invest:risk-check');
  return json(request,env,{subject:ctx.subject,policy,result,executionPerformed:false});
}

export async function handleInvestAutomationApi(request,env){
  const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';
  const handled=path.startsWith('/v1/invest/automation/');if(!handled)return null;
  const {ok,headers}=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:ok?204:403,headers});
  if(!ok)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);
  if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  const write=!['GET','HEAD'].includes(request.method);
  const ctx=await resolveWorkspacePrincipal(request,env,{write});if(ctx.error)return json(request,env,{error:ctx.error},ctx.status);
  if(path==='/v1/invest/automation/status'&&request.method==='GET')return automationStatus(request,env,ctx);
  if(path==='/v1/invest/automation/readiness'&&request.method==='GET')return brokerReadinessStatus(request,env,ctx);
  if(path==='/v1/invest/automation/policy'&&request.method==='PUT')return updatePolicy(request,env,ctx);
  if(path==='/v1/invest/automation/halt'&&request.method==='POST')return setAutomationState(request,env,ctx,'halt');
  if(path==='/v1/invest/automation/resume'&&request.method==='POST')return setAutomationState(request,env,ctx,'ready');
  if(path==='/v1/invest/automation/strategies'&&request.method==='GET')return listStrategies(request,env,ctx);
  if(path==='/v1/invest/automation/strategies'&&request.method==='POST')return createStrategy(request,env,ctx);
  if(path==='/v1/invest/automation/risk-check'&&request.method==='POST')return riskCheck(request,env,ctx);
  return json(request,env,{error:'NOT_FOUND'},404);
}
