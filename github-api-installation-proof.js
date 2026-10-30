// EKODI internal, disabled-by-default GitHub App attestation. Never expose as a public route.
import {recordTrustedGitHubQuota} from './github-api-budget-control.js';
const repo='topmaster-joseph/ekodi-platform';
const minted=new WeakSet();
const id=x=>/^\d{1,15}$/.test(String(x||''))&&Number.isSafeInteger(+x)&&+x>0?+x:null;
const denied=reason=>({verified:false,reason,context:null});
export function isVerifiedGitHubInstallationProof(ctx,{installationId,appId,nowMs=Date.now()}={}){
  return Boolean(ctx&&typeof ctx==='object'&&minted.has(ctx)&&
    Object.isFrozen(ctx)&&ctx.installationId===id(installationId)&&
    ctx.appId===id(appId)&&Number.isSafeInteger(nowMs)&&
    nowMs>=ctx.verifiedAtMs&&nowMs<ctx.expiresAtMs);
}
// Production transport and token must come from trusted EKODI server code,
// not from a browser-provided function, token, installation ID or request JSON.
export async function attestGitHubInstallationToken(env,{
  installationToken,fetchImpl=fetch,nowMs=Date.now()
}={}){
  if(env?.EKODI_GITHUB_BUDGET_ADMISSION_ENABLED!=='true')
    return denied('not_connected');
  const installationId=id(env?.EKODI_GITHUB_INSTALLATION_ID);
  const appId=id(env?.EKODI_GITHUB_APP_ID);
  if(!installationId||!appId||!env?.DB?.prepare||
    typeof installationToken!=='string'||installationToken.length<20||
    !Number.isSafeInteger(nowMs)||nowMs<=0||nowMs>8640000000000000-25000)
    return denied('not_provisioned');
  const headers={authorization:'Bearer '+installationToken,
    accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'};
  try{
    const request=path=>fetchImpl('https://api.github.com'+path,{
      method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)
    });
    const installation=await request('/installation');
    if(!installation?.ok||installation.status!==200)
      return denied('installation_verification_failed');
    const identity=await installation.json();
    if(id(identity?.id)!==installationId||id(identity?.app_id)!==appId)
      return denied('installation_mismatch');
    const response=await request('/repos/'+repo);
    if(!response?.ok||response.status!==200)
      return denied('repository_verification_failed');
    const repository=await response.json();
    if(repository?.full_name!==repo)
      return denied('repository_mismatch');
    // Verified response headers, never caller-supplied quota numbers, enter D1.
    const recorded=await recordTrustedGitHubQuota(env,{
      installationId,headers:response.headers,status:response.status,
      observedAtMs:nowMs,authenticatedServerCall:true
    });
    if(!recorded?.accepted||recorded.resource!=='core')
      return denied('no_fresh_verified_core_budget');
    const context=Object.freeze({source:'ekodi-orchestrator',installationId,
      appId,verifiedAtMs:nowMs,expiresAtMs:nowMs+25000});
    minted.add(context);
    return {verified:true,reason:'verified_installation_and_repository',context};
  }catch{return denied('verification_unavailable');}
}
