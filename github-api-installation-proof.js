// EKODI internal, default-OFF App attestation for shared API reservations.
// Reuses the existing read-only, RS256-signed, metadata-only GitHub App probe.
// Never expose an attestation transport or proof as a user-facing HTTP route.
import {probeEkodiGitHubInstallation} from './github-app-readonly-probe.js';

const minted=new WeakSet();
const id=x=>/^[1-9]\d{0,15}$/.test(String(x??''))&&
  Number.isSafeInteger(Number(x))?Number(x):null;
const denied=reason=>({verified:false,reason,context:null});
export function isVerifiedGitHubInstallationProof(ctx,{
  installationId,appId,nowMs=Date.now()
}={}){
  return Boolean(ctx&&typeof ctx==='object'&&minted.has(ctx)&&
    Object.isFrozen(ctx)&&ctx.source==='ekodi-orchestrator'&&
    ctx.installationId===id(installationId)&&ctx.appId===id(appId)&&
    Number.isSafeInteger(nowMs)&&nowMs>=ctx.verifiedAtMs&&
    nowMs<ctx.expiresAtMs);
}
// The production caller is trusted server code; fetchImpl/subtle are private
// deterministic-test seams, never accepted from browser/API input.
// The proof attests a read-only App identity and verified quota observation;
// it is NOT a GitHub installation token, write authority or release approval.
export async function attestGitHubInstallationToken(env,{
  fetchImpl=fetch,subtle=globalThis.crypto?.subtle,nowMs=Date.now()
}={}){
  if(env?.EKODI_GITHUB_BUDGET_ADMISSION_ENABLED!=='true')
    return denied('not_connected');
  if(env?.EKODI_GITHUB_READONLY_PROBE_ENABLED!=='true')
    return denied('readonly_probe_not_enabled');
  const appId=id(env?.EKODI_GITHUB_APP_ID);
  const installationId=id(env?.EKODI_GITHUB_INSTALLATION_ID);
  if(!appId||!installationId||!env?.DB?.prepare||
    !env?.EKODI_GITHUB_APP_PRIVATE_KEY||!subtle||
    !Number.isSafeInteger(nowMs)||nowMs<1000000000000||
    nowMs>8640000000000000-600000)
    return denied('not_provisioned');
  try{
    const verified=await probeEkodiGitHubInstallation(env,{
      fetchImpl,subtle,now:()=>nowMs
    });
    if(!verified?.ok||verified.installationVerified!==true||
      verified.resource!=='core'||verified.githubApiCalls!==2||
      verified.tokenExposed!==false||verified.admissionEnabled!==false)
      return denied(verified?.reason||'readonly_attestation_failed');
    const context=Object.freeze({source:'ekodi-orchestrator',
      installationId,appId,verifiedAtMs:nowMs,expiresAtMs:nowMs+25000
    });
    minted.add(context);
    return {verified:true,reason:'verified_readonly_installation_observation',context};
  }catch{
    return denied('verification_unavailable');
  }
}
