/**
 * EKODI native automation handoff gate.
 *
 * This is a pure, fail-closed advisory projection. The authenticated EKODI
 * Orchestrator verifies raw source receipts before calling it. No code here
 * authorizes GitHub workflow approval, publication, billing or ChatGPT changes.
 */
export const NATIVE_JOB_REQUIREMENTS=Object.freeze({
  'social-accounts-release':Object.freeze({
    legacyMode:'monitoring',
    evidenceKinds:['native-schedule','release-sha','authenticated-social-ui-e2e','production-readback'],
    humanGate:false
  }),
  'church-live-release':Object.freeze({
    legacyMode:'monitoring',
    evidenceKinds:['native-schedule','release-sha','authenticated-church-studio-e2e','anonymous-viewer-e2e','production-readback'],
    humanGate:false
  }),
  'human-publishing-editorial':Object.freeze({
    legacyMode:'production',
    evidenceKinds:['native-schedule','editorial-edition-ledger','signed-author-approval','epub-accessibility','native-storage-readback'],
    humanGate:true
  }),
  'church-weekly-worship':Object.freeze({
    legacyMode:'production',
    evidenceKinds:['native-schedule','pastor-approved-text','sermon-google-doc','bulletin-google-doc','worship-google-slides','native-storage-readback'],
    humanGate:true
  })
});
const SHA=/^[a-f0-9]{40}$/i;
const knownEvidenceTypes=new Set(Object.values(NATIVE_JOB_REQUIREMENTS).flatMap(item=>item.evidenceKinds));
const text=(value,n=120)=>String(value??'').slice(0,n);
const isInt=value=>Number.isSafeInteger(value)&&value>0;
const timestamp=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))return NaN;
  return Date.parse(value);
};
/**
 * "trustedReceipts" must be created by a server-side EKODI adapter that has
 * independently verified GitHub/OIDC source and artifact metadata. An
 * arbitrary JSON 'verified' flag must never be enough to disable a legacy
 * task; this module NEVER performs that destructive action.
 */
export function projectNativeCutover({
  jobId,legacyState='enabled',nativeRun=null,receipts=[],verifiedSources=[],
  ownerApproval=null,lease=null,legacyDisableReceipt=null,nowMs=Date.now()
}={}){
  const job=NATIVE_JOB_REQUIREMENTS[jobId];
  if(!job)return Object.freeze({jobId:text(jobId),state:'blocked',reason:'unknown_job',cutoverAllowed:false});
  const reasons=[];
  if(legacyState!=='enabled'&&legacyState!=='disabled')reasons.push('legacy_state_unverified');
  if(!nativeRun||!isInt(nativeRun.runId)||nativeRun.repository!=='topmaster-joseph/ekodi-platform'||
     nativeRun.owner!=='EKODI Orchestrator'||nativeRun.branch!=='main'||
     !SHA.test(nativeRun.headSha||'')||nativeRun.event!=='schedule'&&nativeRun.event!=='workflow_dispatch'||
     nativeRun.status!=='completed'||nativeRun.conclusion!=='success'||
     !isInt(nativeRun.artifactBytes)||nativeRun.artifactExpired!==false){
    reasons.push('native_run_not_verified');
  }else{
    const ended=timestamp(nativeRun.completedAt);
    if(!Number.isFinite(ended)||ended>nowMs+60000||ended<nowMs-7*86400000)
      reasons.push('native_run_stale');
  }
  const sourceKeys=new Set(Array.isArray(verifiedSources)?verifiedSources:[]);
  const accepted=new Set();
  if(!Array.isArray(receipts))reasons.push('receipts_invalid');
  else for(const receipt of receipts){
    if(!receipt||!knownEvidenceTypes.has(receipt.kind)||receipt.jobId!==jobId||
       !SHA.test(receipt.sourceSha||'')||!isInt(receipt.runId)||
       receipt.runId!==nativeRun?.runId||receipt.sourceSha!==nativeRun?.headSha||
       !sourceKeys.has(receipt.verificationId)||receipt.verifiedBy!=='EKODI Orchestrator')continue;
    const time=timestamp(receipt.verifiedAt);
    if(!Number.isFinite(time)||time>nowMs+60000||time<nowMs-7*86400000)continue;
    if(!receipt.artifactDigest||!/^[a-f0-9]{64}$/i.test(receipt.artifactDigest))continue;
    if(receipt.result!=='passed')continue;
    accepted.add(receipt.kind);
  }
  const missing=job.evidenceKinds.filter(k=>!accepted.has(k));
  for(const kind of missing)reasons.push('missing:'+kind);
  if(!lease||lease.owner!=='EKODI Orchestrator'||!isInt(lease.generation)||
      lease.taskId!==jobId||lease.status!=='exclusive'||lease.provenNoConcurrentLegacyWrite!==true)
    reasons.push('execution_lease_not_proven');
  if(job.humanGate&&(!ownerApproval||ownerApproval.taskId!==jobId||
      ownerApproval.authority!=='verified-human-gate'||ownerApproval.revision!==nativeRun?.headSha||
      !sourceKeys.has(ownerApproval.verificationId)))
    reasons.push('human_approval_missing');
  if(legacyState==='disabled'){
    const proof=legacyDisableReceipt;
    const time=timestamp(proof?.verifiedAt);
    if(!proof||proof.taskId!==jobId||proof.platform!=='chatgpt-automations'||
        proof.isEnabled!==false||!sourceKeys.has(proof.verificationId)||
        !Number.isFinite(time)||time>nowMs+60000||time<nowMs-30*86400000)
      reasons.push('legacy_disable_receipt_missing');
  }
  // A successful monitor is not a complete content-producing replacement.
  const ready=reasons.length===0;
  const state=legacyState==='disabled'
    ?(ready?'cutover_confirmed':'disabled_without_parity')
    :(ready?'eligible_for_separate_legacy_disable':'handoff_blocked');
  return Object.freeze({
    jobId,mode:job.legacyMode,state,cutoverAllowed:ready&&legacyState==='enabled',
    nativeOwned:ready,legacyDisabled:legacyState==='disabled',
    evidenceRequired:[...job.evidenceKinds],evidenceAccepted:[...accepted],
    reasons:[...reasons],advisoryOnly:true,
    makesExternalChanges:false,canDisableLegacyTask:false
  });
}
export function summarizeNativeCutover(jobs){
  const values=Array.isArray(jobs)?jobs:[];
  return {
    owner:'EKODI Orchestrator',
    legacyDisableActionsTaken:0,
    verifiedCutovers:values.filter(x=>x.state==='cutover_confirmed').length,
    readyButStillEnabled:values.filter(x=>x.state==='eligible_for_separate_legacy_disable').length,
    blocked:values.filter(x=>!x.nativeOwned).length,
    allNative:values.length===Object.keys(NATIVE_JOB_REQUIREMENTS).length&&
      values.every(x=>x.state==='cutover_confirmed')
  };
}
