import { AI_COST_POLICY } from './ai-cost-policy.js';

const clean=value=>String(value??'').trim();
const FREE_PROVIDER_IDS=Object.freeze(['cloudflare-workers-ai','gemini-free','openrouter-free','groq-free']);
const FREE_PROVIDER_SET=new Set(FREE_PROVIDER_IDS);

export const AI_FREE_QUOTA_POLICY=Object.freeze({
  version:'1.0.0',
  policyId:'AI-FREE-QUOTA-001',
  mode:'free-first-human-paid-gate',
  freeProviderIds:FREE_PROVIDER_IDS,
  paidAutoEscalation:false,
  paidDecisionRequired:true,
  dailySafetyCaps:Object.freeze({
    'cloudflare-workers-ai':4,
    'openrouter-free':45,
    'groq-free':900,
  }),
});

export function isFreeAiProvider(providerId=''){return FREE_PROVIDER_SET.has(clean(providerId).toLowerCase())}

export function configuredFreeProviderIds(capabilities={}){
  const ids=[];
  if(capabilities.cloudflareWorkersAi)ids.push('cloudflare-workers-ai');
  if(capabilities.geminiFree)ids.push('gemini-free');
  if(capabilities.openrouterFree)ids.push('openrouter-free');
  if(capabilities.groqFree)ids.push('groq-free');
  return ids;
}

export function hasAlternateZeroCostExecution(capabilities={}){
  if((capabilities.nodeProviders||[]).length)return true;
  const profiles=capabilities.providerProfiles||{};
  return (capabilities.workerProviders||[]).some(raw=>{
    const id=`worker:${clean(raw).toLowerCase()}`;
    const cost=clean(profiles[id]?.costClass).toLowerCase();
    return AI_COST_POLICY.zeroMarginalCostClasses.includes(cost);
  });
}

function nextUtcDay(nowMs=Date.now()){
  const date=new Date(nowMs);
  return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString();
}
function retryAt(error,nowMs){
  const explicit=clean(error?.quota?.resetAt);
  if(explicit)return explicit;
  const seconds=Number(error?.retryAfterSeconds);
  if(Number.isFinite(seconds)&&seconds>0)return new Date(nowMs+seconds*1000).toISOString();
  return new Date(nowMs+60_000).toISOString();
}
function quotaNumber(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):null;
}

export function classifyFreeQuotaError(providerId,error,nowMs=Date.now()){
  const id=clean(providerId).toLowerCase();
  if(!isFreeAiProvider(id))return Object.freeze({state:'error',resetAt:'',remainingRequests:null,remainingTokens:null});
  const explicit=error?.quota&&typeof error.quota==='object'?error.quota:{};
  const message=clean(error?.message||error).toLowerCase();
  const status=Number(error?.status||0);
  const quotaLike=status===429||/quota|rate.?limit|resource_exhausted|daily[_ -]?call[_ -]?limit|too_many_requests|free[_ -]?limit/.test(message);
  if(!quotaLike)return Object.freeze({state:'error',resetAt:'',remainingRequests:null,remainingTokens:null});
  const daily=explicit.state==='exhausted'||/daily|per[_ -]?day|requests[_ -]?per[_ -]?day|\brpd\b|daily[_ -]?call[_ -]?limit|free[_ -]?limit|quota_exhausted/.test(message);
  return Object.freeze({
    state:daily?'exhausted':'throttled',
    resetAt:clean(explicit.resetAt)||(daily?nextUtcDay(nowMs):retryAt(error,nowMs)),
    remainingRequests:quotaNumber(explicit.remainingRequests)??(daily?0:null),
    remainingTokens:quotaNumber(explicit.remainingTokens),
  });
}

function activeState(row,nowMs=Date.now()){
  if(!row)return{state:'unknown',remainingRequests:null,remainingTokens:null,resetAt:'',lastError:'',lastObservedAt:''};
  const resetAt=clean(row.reset_at);
  const expired=resetAt&&Date.parse(resetAt)<=nowMs;
  if(expired&&['exhausted','throttled'].includes(clean(row.state).toLowerCase())){
    return{state:'reset_due',remainingRequests:null,remainingTokens:null,resetAt,lastError:clean(row.last_error),lastObservedAt:clean(row.last_observed_at)};
  }
  return{
    state:clean(row.state).toLowerCase()||'unknown',
    remainingRequests:quotaNumber(row.remaining_requests),
    remainingTokens:quotaNumber(row.remaining_tokens),
    resetAt,
    lastError:clean(row.last_error),
    lastObservedAt:clean(row.last_observed_at),
  };
}

export async function loadFreeQuotaStates(env={},providerIds=FREE_PROVIDER_IDS,nowMs=Date.now()){
  const ids=[...new Set(providerIds.map(v=>clean(v).toLowerCase()).filter(isFreeAiProvider))];
  const out=Object.fromEntries(ids.map(id=>[id,activeState(null,nowMs)]));
  if(!ids.length||!env.DB?.prepare)return out;
  const placeholders=ids.map(()=>'?').join(',');
  try{
    const data=await env.DB.prepare(`SELECT provider_id,state,remaining_requests,remaining_tokens,reset_at,last_error,last_observed_at FROM ai_provider_quota_state WHERE provider_id IN (${placeholders})`).bind(...ids).all();
    for(const row of data.results||[])out[row.provider_id]=activeState(row,nowMs);
  }catch{}
  return out;
}

export async function quotaCapabilities(env={},providerIds=FREE_PROVIDER_IDS,nowMs=Date.now()){
  const states=await loadFreeQuotaStates(env,providerIds,nowMs);
  return Object.fromEntries(Object.entries(states).map(([id,state])=>{
    const blocked=['exhausted','throttled'].includes(state.state)&&(!state.resetAt||Date.parse(state.resetAt)>nowMs);
    return[id,{remaining:blocked?0:state.remainingRequests,state:state.state,resetAt:state.resetAt}];
  }));
}

async function writeQuotaState(env,providerId,{state,remainingRequests=null,remainingTokens=null,resetAt='',lastError='',statusCode=0}){
  if(!env.DB?.prepare||!isFreeAiProvider(providerId))return;
  const stamp=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ai_provider_quota_state
    (provider_id,cost_class,state,remaining_requests,remaining_tokens,reset_at,last_status_code,last_error,last_observed_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(provider_id) DO UPDATE SET
      state=excluded.state,remaining_requests=excluded.remaining_requests,remaining_tokens=excluded.remaining_tokens,
      reset_at=excluded.reset_at,last_status_code=excluded.last_status_code,last_error=excluded.last_error,
      last_observed_at=excluded.last_observed_at,updated_at=excluded.updated_at`)
    .bind(providerId,'free-preferred',state,remainingRequests,remainingTokens,resetAt||null,Number(statusCode)||0,clean(lastError).slice(0,240),stamp,stamp).run();
}

export async function recordFreeProviderOutcome(env={},providerId,{ok=false,error=null,quota=null}={}){
  const id=clean(providerId).toLowerCase();
  if(!isFreeAiProvider(id))return;
  if(ok){
    const remainingRequests=quotaNumber(quota?.remainingRequests);
    const remainingTokens=quotaNumber(quota?.remainingTokens);
    const state=remainingRequests===0?'exhausted':'available';
    await writeQuotaState(env,id,{state,remainingRequests,remainingTokens,resetAt:state==='exhausted'?(clean(quota?.resetAt)||nextUtcDay()):clean(quota?.resetAt)});
    return;
  }
  const classified=classifyFreeQuotaError(id,error);
  if(classified.state==='error')return;
  await writeQuotaState(env,id,{...classified,lastError:clean(error?.message||error),statusCode:Number(error?.status||0)});
}

export async function reserveFreeDailyRequest(env={},providerId,limit){
  const id=clean(providerId).toLowerCase(),cap=Math.max(1,Math.floor(Number(limit)||1));
  if(!isFreeAiProvider(id))throw new Error('invalid_free_provider');
  if(!env.DB?.prepare){
    if(clean(env.ENVIRONMENT).toLowerCase()==='production')throw new Error('FREE_QUOTA_DB_UNAVAILABLE');
    return Object.freeze({used:null,limit:cap,remaining:null});
  }
  const day=new Date().toISOString().slice(0,10),stamp=new Date().toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO ai_provider_daily_budget (provider_id,usage_date,call_count,updated_at) VALUES (?,?,0,?)').bind(id,day,stamp).run();
  const update=await env.DB.prepare('UPDATE ai_provider_daily_budget SET call_count=call_count+1,updated_at=? WHERE provider_id=? AND usage_date=? AND call_count<?').bind(stamp,id,day,cap).run();
  const changed=Number(update?.meta?.changes??update?.changes??0);
  if(changed<1){
    const error=new Error(`${id.toUpperCase().replace(/[^A-Z0-9]+/g,'_')}_DAILY_FREE_LIMIT`);
    error.status=429;error.quota={state:'exhausted',remainingRequests:0,resetAt:nextUtcDay()};throw error;
  }
  const row=await env.DB.prepare('SELECT call_count FROM ai_provider_daily_budget WHERE provider_id=? AND usage_date=?').bind(id,day).first();
  const used=Number(row?.call_count||0);
  return Object.freeze({used,limit:cap,remaining:Math.max(0,cap-used),resetAt:nextUtcDay()});
}

export async function freePoolSnapshot(env={},providerIds=FREE_PROVIDER_IDS,{alternateZeroCostAvailable=false,nowMs=Date.now()}={}){
  const ids=[...new Set(providerIds.map(v=>clean(v).toLowerCase()).filter(isFreeAiProvider))];
  const states=await loadFreeQuotaStates(env,ids,nowMs);
  const providers=ids.map(id=>({id,...states[id]}));
  const exhausted=providers.filter(p=>p.state==='exhausted'&&(!p.resetAt||Date.parse(p.resetAt)>nowMs));
  const throttled=providers.filter(p=>p.state==='throttled'&&(!p.resetAt||Date.parse(p.resetAt)>nowMs));
  const allExhausted=ids.length>0&&exhausted.length===ids.length&&!alternateZeroCostAvailable;
  return Object.freeze({
    policyId:AI_FREE_QUOTA_POLICY.policyId,
    configuredProviderIds:ids,
    providers,
    exhaustedProviderIds:exhausted.map(p=>p.id),
    throttledProviderIds:throttled.map(p=>p.id),
    alternateZeroCostAvailable:Boolean(alternateZeroCostAvailable),
    allExhausted,
    paidAutoEscalation:false,
    paidDecisionRequired:allExhausted,
  });
}

export async function ensureFreePoolDecisionAlert(env={},providerIds=FREE_PROVIDER_IDS,options={}){
  const snapshot=await freePoolSnapshot(env,providerIds,options);
  if(!snapshot.allExhausted||!env.DB?.prepare)return{snapshot,alert:null};
  const stamp=new Date().toISOString();
  const key='ai-free-pool-exhausted';
  const title='무료 AI 사용 한도 소진';
  const message='연결된 무료 AI 공급자의 사용 가능 한도가 모두 소진되었습니다. 유료 API는 자동으로 사용하지 않습니다. 무료 유지 또는 유료 설정 검토를 선택해 주세요.';
  await env.DB.prepare(`INSERT INTO ai_provider_alerts
    (id,alert_key,alert_type,severity,status,title,message,provider_ids_json,decision_required,decision,decision_by,decision_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,1,'','',NULL,?,?)
    ON CONFLICT(alert_key) DO UPDATE SET
      severity='warning',status='open',title=excluded.title,message=excluded.message,
      provider_ids_json=excluded.provider_ids_json,decision_required=1,decision='',decision_by='',decision_at=NULL,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),key,'free_quota_exhausted','warning','open',title,message,JSON.stringify(snapshot.configuredProviderIds),stamp,stamp).run();
  const alert=await env.DB.prepare('SELECT * FROM ai_provider_alerts WHERE alert_key=?').bind(key).first();
  return{snapshot,alert};
}

function alertView(row){
  if(!row)return null;
  let providers=[];try{providers=JSON.parse(row.provider_ids_json||'[]')}catch{}
  return{id:row.id,type:row.alert_type,severity:row.severity,status:row.status,title:row.title,message:row.message,providerIds:providers,decisionRequired:Boolean(row.decision_required),decision:row.decision||'',createdAt:row.created_at,updatedAt:row.updated_at};
}

export async function listOpenAiCostAlerts(env={}){
  if(!env.DB?.prepare)return[];
  try{
    const data=await env.DB.prepare("SELECT * FROM ai_provider_alerts WHERE status IN ('open','reviewing') ORDER BY updated_at DESC LIMIT 20").all();
    return(data.results||[]).map(alertView);
  }catch{return[]}
}

export async function recordAiCostAlertDecision(env={},alertId,decision,actor=''){
  if(!env.DB?.prepare)throw new Error('state_store_unavailable');
  const id=clean(alertId),choice=clean(decision).toLowerCase();
  if(!id||!['stay-free','review-paid'].includes(choice))throw new Error('invalid_cost_alert_decision');
  const stamp=new Date().toISOString(),status=choice==='stay-free'?'resolved':'reviewing';
  const result=await env.DB.prepare("UPDATE ai_provider_alerts SET status=?,decision=?,decision_by=?,decision_at=?,updated_at=? WHERE id=? AND status IN ('open','reviewing')")
    .bind(status,choice,clean(actor).slice(0,240),stamp,stamp,id).run();
  if(Number(result?.meta?.changes??result?.changes??0)<1)throw new Error('cost_alert_not_found');
  return alertView(await env.DB.prepare('SELECT * FROM ai_provider_alerts WHERE id=?').bind(id).first());
}

export async function resolveCostAlertsForPaidConfiguration(env={},actor=''){
  if(!env.DB?.prepare)return;
  const stamp=new Date().toISOString();
  await env.DB.prepare("UPDATE ai_provider_alerts SET status='resolved',decision='paid-provider-enabled',decision_by=?,decision_at=?,updated_at=? WHERE alert_type='free_quota_exhausted' AND status IN ('open','reviewing')")
    .bind(clean(actor).slice(0,240),stamp,stamp).run();
}
