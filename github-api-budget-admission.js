// EKODI Orchestrator. Internal, fail-closed GitHub API capacity reservation.
// No public route, token issuance, GitHub call, merge, or deployment action.
const resources=new Set(['core','search','graphql','integration_manifest','source_import',
  'code_scanning_upload','actions_runner_registration','audit_log','code_search']);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const numericId=v=>/^\d{1,15}$/.test(String(v||''))&&positive(Number(v))?Number(v):null;
export const INSERT_GITHUB_API_RESERVATION=[
  'INSERT INTO github_operations_api_admissions',
  '(operation_key,installation_id,resource,head_sha,unit_cost,observed_at_ms,admitted_at_ms,expires_at_ms)',
  'SELECT ?,b.installation_id,b.resource,?,?,b.observed_at_ms,?,?',
  'FROM github_operations_api_budgets AS b',
  'WHERE b.installation_id=? AND b.resource=?',
  "AND b.evidence_kind='verified_response'",
  'AND b.observed_at_ms>=? AND b.observed_at_ms<=?',
  'AND b.reset_at_ms>? AND b.blocked_until_ms<=?',
  'AND b.remaining_value >= ? + ? + COALESCE((',
  'SELECT SUM(a.unit_cost) FROM github_operations_api_admissions AS a',
  'WHERE a.installation_id=b.installation_id AND a.resource=b.resource',
  'AND a.admitted_at_ms>=b.observed_at_ms AND a.expires_at_ms>?',
  '),0)',
  'AND NOT EXISTS(SELECT 1 FROM github_operations_api_admissions AS q WHERE q.operation_key=?)'
].join('\n');

// The internal caller must independently verify the App installation token.
// The authContext object is NOT itself a cryptographic token verification.
// Do not expose this primitive to untrusted request payloads.
export async function reserveTrustedGitHubApiBudget(env,{
  installationId,resource,operationKey,headSha,unitCost=1,
  nowMs=Date.now(),authContext
}={}){
  if(env?.EKODI_GITHUB_BUDGET_ADMISSION_ENABLED!=='true')
    return {admitted:false,reason:'not_connected'};
  const id=numericId(installationId);
  if(!id||id!==numericId(env.EKODI_GITHUB_INSTALLATION_ID)||
    authContext?.source!=='ekodi-orchestrator'||
    authContext?.verifiedInstallationToken!==true||
    authContext?.installationId!==id)
    return {admitted:false,reason:'not_authorized'};
  if(!resources.has(resource)||!/^[a-f0-9]{64}$/.test(String(operationKey||''))||
    !/^[a-f0-9]{40}$/.test(String(headSha||''))||
    !Number.isSafeInteger(unitCost)||unitCost<1||unitCost>5||
    !positive(nowMs)||nowMs>8640000000000000-15000)
    return {admitted:false,reason:'invalid_request'};
  if(typeof env?.DB?.prepare!=='function')
    return {admitted:false,reason:'storage_unavailable'};
  const expiresAtMs=nowMs+15000;
  const args=[
    operationKey,headSha,unitCost,nowMs,expiresAtMs,id,resource,
    nowMs-30000,nowMs,expiresAtMs,nowMs,unitCost,25,nowMs,operationKey
  ];
  try{
    const result=await env.DB.prepare(INSERT_GITHUB_API_RESERVATION)
      .bind(...args).run();
    return result?.meta?.changes===1
      ? {admitted:true,reason:'reserved',expiresAtMs}
      : {admitted:false,reason:'no_fresh_budget_or_duplicate'};
  }catch{
    return {admitted:false,reason:'storage_unavailable'};
  }
}
