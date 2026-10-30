// EKODI Orchestrator: admin-triggered read-only canary, 6h atomic D1 deduplication.
// No unattended polling, public GitHub mutation, token display, or release authority.
import {probeEkodiGitHubInstallation} from './github-app-readonly-probe.js';

const SIX_HOURS=21600000;
const validId=x=>/^[1-9][0-9]{0,15}$/.test(String(x??''))&&
  Number.isSafeInteger(Number(x));
const safeResult=result=>({
  ok:result?.ok===true,
  reason:result?.ok===true?'verified_readonly_observation':
    /^[a-z_]{2,60}$/.test(String(result?.reason||''))?result.reason:'probe_unavailable',
  githubApiCalls:Number.isSafeInteger(result?.githubApiCalls)&&
    result.githubApiCalls>=0&&result.githubApiCalls<=2?result.githubApiCalls:0,
  releaseAuthorized:false,admissionEnabled:false,tokenExposed:false,
});
export function githubProbeConfigured(env){
  return env?.EKODI_GITHUB_READONLY_PROBE_ENABLED==='true' &&
    validId(env.EKODI_GITHUB_APP_ID)&&
    validId(env.EKODI_GITHUB_INSTALLATION_ID)&&
    typeof env.EKODI_GITHUB_APP_PRIVATE_KEY==='string' &&
    env.EKODI_GITHUB_APP_PRIVATE_KEY.trim().length>100;
}
export async function githubProbeReadModel(env){
  const enabled=env?.EKODI_GITHUB_READONLY_PROBE_ENABLED==='true';
  const configured=githubProbeConfigured(env);
  const basic={state:!enabled?'disabled':!configured?'not_provisioned':'ready_unverified',
    enabled,configured,automatic:false,mutationPermission:false,
    latest:null,githubApiCalls:0};
  if(!env?.DB?.prepare)return {...basic,state:enabled?'db_unavailable':basic.state};
  try {
    const latest=await env.DB.prepare(
      'SELECT state,reason,github_api_calls,claimed_at,finished_at FROM github_app_probe_attempts '+
      'ORDER BY claimed_at DESC LIMIT 1').first();
    return {...basic,latest:latest?{
      state:latest.state,reason:latest.reason||null,
      githubApiCalls:Number(latest.github_api_calls)||0,
      claimedAt:latest.claimed_at,finishedAt:latest.finished_at||null,
    }:null};
  }catch{return {...basic,state:enabled?'schema_unavailable':basic.state};}
}

export async function runGithubAppReadonlyCanary(env,{
  nowMs=Date.now(),probeImpl=probeEkodiGitHubInstallation
}={}){
  // Must not reserve a lease (or even query D1) when the owner has not enabled.
  if(!githubProbeConfigured(env))
    return {...safeResult({reason:env?.EKODI_GITHUB_READONLY_PROBE_ENABLED!=='true'
      ?'not_enabled':'not_provisioned'}),githubApiCalls:0};
  if(!env?.DB?.prepare||!Number.isSafeInteger(nowMs)||nowMs<1000000000000)
    return safeResult({reason:'storage_unavailable'});
  const installationId=Number(env.EKODI_GITHUB_INSTALLATION_ID);
  const slotKey=installationId+':'+Math.floor(nowMs/SIX_HOURS);
  const startedAt=new Date(nowMs).toISOString();
  let admitted;
  try{
    // Cross-worker D1 primary key: no concurrent credential minting on a
    // scheduled 6h slot, including if the previous attempt returned 4xx/5xx.
    const lease=await env.DB.prepare(
      "INSERT OR IGNORE INTO github_app_probe_attempts "+
      "(slot_key,installation_id,state,reason,github_api_calls,claimed_at) "+
      "VALUES (?,?,'claimed','',0,?)").bind(slotKey,installationId,startedAt).run();
    admitted=lease?.meta?.changes===1;
  }catch{return safeResult({reason:'storage_unavailable'});}
  if(!admitted)return safeResult({reason:'already_attempted_this_window'});
  let result;
  try{result=safeResult(await probeImpl(env,{now:()=>nowMs}));}
  catch{result=safeResult({reason:'probe_unavailable'});}
  try{
    // The audit row contains only fixed-state vocabulary and number of calls.
    await env.DB.prepare(
      "UPDATE github_app_probe_attempts SET state=?,reason=?,github_api_calls=?,finished_at=? "+
      "WHERE slot_key=? AND state='claimed'"
    ).bind(result.ok?'verified':'denied',result.reason,result.githubApiCalls,
      new Date(nowMs).toISOString(),slotKey).run();
  }catch{return safeResult({reason:'audit_unavailable',githubApiCalls:result.githubApiCalls});}
  return result;
}
