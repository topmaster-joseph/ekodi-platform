// EKODI Orchestrator GitHub API quota telemetry.
// This module has NO public mutation route, GitHub token or API call.
// Only a future verified server-side GitHub caller may write measured headers.
const RESOURCES=new Set([
  'core','search','graphql','integration_manifest','source_import',
  'code_scanning_upload','actions_runner_registration','audit_log','code_search'
]);
const read=(h,k)=>typeof h?.get==='function'?h.get(k):Object.entries(h||{})
  .find(([name])=>name.toLowerCase()===k)?.[1]??null;
const int=(v)=>v!=null&&/^\d+$/.test(String(v))&&Number.isSafeInteger(Number(v))?
  Number(v):null;

export function parseGitHubQuotaObservation(headers,{observedAtMs=Date.now(),status=200}={}){
  const resource=String(read(headers,'x-ratelimit-resource')||'');
  const limit=int(read(headers,'x-ratelimit-limit'));
  const remaining=int(read(headers,'x-ratelimit-remaining'));
  const resetSec=int(read(headers,'x-ratelimit-reset'));
  if(!RESOURCES.has(resource)||limit==null||remaining==null||
     remaining>limit||resetSec==null||!Number.isSafeInteger(resetSec*1000)||
     !Number.isSafeInteger(observedAtMs)||observedAtMs<=0)return null;
  const resetAtMs=resetSec*1000;
  // A recorded 0 is real, but it is not permission to extrapolate another worker's
  // remaining quota. 403 permission errors and 429 with no rate headers are unknown.
  let blockedUntilMs=0;
  const retry=int(read(headers,'retry-after'));
  if((status===429||(status===403&&remaining===0))&&retry!=null&&retry<=86400)
    blockedUntilMs=observedAtMs+retry*1000;
  if(remaining===0&&resetAtMs>observedAtMs)
    blockedUntilMs=Math.max(blockedUntilMs,resetAtMs);
  return {resource,limit,remaining,resetAtMs,observedAtMs,blockedUntilMs};
}

export async function recordTrustedGitHubQuota(env, {
  installationId,headers,status,observedAtMs=Date.now(),authenticatedServerCall=false
}={}){
  // Require explicit server-side authority: never accept a browser-provided
  // "remaining", "limit" or rate-limiting flag as a source of truth.
  if(authenticatedServerCall!==true)throw Error('GITHUB_BUDGET_AUTHENTICATED_SOURCE_REQUIRED');
  const installation=int(installationId);
  if(installation==null||installation<1)throw Error('GITHUB_BUDGET_INVALID_INSTALLATION');
  const point=parseGitHubQuotaObservation(headers,{observedAtMs,status});
  if(!point)throw Error('GITHUB_BUDGET_VERIFIED_HEADERS_REQUIRED');
  if(!env?.DB?.prepare)throw Error('GITHUB_BUDGET_DB_UNAVAILABLE');
  const sql="INSERT INTO github_operations_api_budgets "+
    "(installation_id,resource,limit_value,remaining_value,reset_at_ms,"+
    "observed_at_ms,blocked_until_ms,evidence_kind) "+
    "VALUES (?,?,?,?,?,?,?,'verified_response') "+
    "ON CONFLICT(installation_id,resource) DO UPDATE SET "+
    "limit_value=excluded.limit_value,remaining_value=excluded.remaining_value,"+
    "reset_at_ms=excluded.reset_at_ms,observed_at_ms=excluded.observed_at_ms,"+
    "blocked_until_ms=excluded.blocked_until_ms "+
    "WHERE excluded.observed_at_ms>github_operations_api_budgets.observed_at_ms";
  const result=await env.DB.prepare(sql)
    .bind(installation,point.resource,point.limit,point.remaining,
      point.resetAtMs,point.observedAtMs,point.blockedUntilMs).run();
  return {accepted:result?.meta?.changes>0,resource:point.resource};
}

export function projectGitHubQuotaRows(rows,{nowMs=Date.now()}={}){
  const safe=Array.isArray(rows)?rows:[];
  return safe.filter(row=>RESOURCES.has(row?.resource)&&
    Number.isSafeInteger(row?.installation_id)&&row.installation_id>0)
    .map(row=>{
      const reset=Number(row.reset_at_ms)||0;
      const observed=Number(row.observed_at_ms)||0;
      const remaining=Number(row.remaining_value);
      const limit=Number(row.limit_value);
      const fresh=observed>0&&nowMs>=observed&&nowMs-observed<=120000&&reset>nowMs;
      const valid=Number.isSafeInteger(remaining)&&Number.isSafeInteger(limit)&&
        remaining>=0&&limit>=remaining;
      return {
        resource:row.resource,installationId:row.installation_id,
        measured:valid&&fresh,remaining:valid&&fresh?remaining:null,
        limit:valid&&fresh?limit:null,
        resetAt:reset>0?new Date(reset).toISOString():null,
        lastObservedAt:observed>0?new Date(observed).toISOString():null,
        blockedUntil:row.blocked_until_ms>nowMs?new Date(row.blocked_until_ms).toISOString():null,
        state:!valid?'invalid_evidence':fresh?'fresh':'stale'
      };
    });
}

export async function githubQuotaReadModel(env,{nowMs=Date.now()}={}){
  if(!env?.DB?.prepare)return {state:'db_unavailable',buckets:[],enforcement:'not_connected'};
  try{
    const data=await env.DB.prepare(
      'SELECT installation_id,resource,limit_value,remaining_value,reset_at_ms,'+
      'observed_at_ms,blocked_until_ms FROM github_operations_api_budgets '+
      'ORDER BY observed_at_ms DESC LIMIT 30').all();
    const buckets=projectGitHubQuotaRows(data?.results||[],{nowMs});
    return {state:buckets.some(x=>x.measured)?'verified_observation':
      buckets.length?'stale':'no_verified_observation',
      buckets,enforcement:'not_connected'};
  }catch{
    // Additive migrations may not be promoted yet. Never claim zero calls
    // or invent a remaining quota on a missing storage table.
    return {state:'schema_unavailable',buckets:[],enforcement:'not_connected'};
  }
}
