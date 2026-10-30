// Authenticated EKODI staging evidence: durable event, NOT mutable worker evidence.
// The canonical completion-reconciliation route verifies GitHub OIDC before
// invoking this writer. No application code, approval or release is performed.
const BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;
const SHA=/^[a-f0-9]{40}$/i;
const DIGEST=/^sha256:[a-f0-9]{64}$/i;
const WORKFLOW='topmaster-joseph/ekodi-platform/.github/workflows/reconcile-orchestrator-completions.yml@refs/heads/main';
const clean=(v,max=300)=>String(v??'').trim().slice(0,max);
const fail=reason=>Object.freeze({recorded:false,reason,productionDeployed:false});
const changes=result=>Number(result?.meta?.changes??result?.changes??0);
const json=s=>{try{return JSON.parse(s||'{}')}catch{return null}};

export async function recordVerifiedEkodiPreproductionEvidence(db,evidence,oidc={}){
  if(!db?.prepare||!db?.batch)return fail('orchestrator_database_unavailable');
  if(oidc.ok!==true||oidc.repository!=='topmaster-joseph/ekodi-platform'||
     oidc.ref!=='refs/heads/main'||oidc.workflowRef!==WORKFLOW||
     !Number.isSafeInteger(Number(oidc.runId))||Number(oidc.runId)<1){
    return fail('trusted_reconciler_oidc_required');
  }
  const taskId=clean(evidence?.taskId,160),branchRef=clean(evidence?.branchRef,220);
  const releaseSha=clean(evidence?.releaseSha,80),artifactDigest=clean(evidence?.artifactDigest,150);
  const archiveDigest=clean(evidence?.archiveDigest,150);
  if(evidence?.verified!==true||evidence?.source!=='github-actions-staging-verifier'||
     evidence.releaseAuthorized!==false||evidence.productionDeployed!==false||
     !BRANCH.test(branchRef)||!branchRef.endsWith('/'+taskId)||
     !SHA.test(releaseSha)||!DIGEST.test(artifactDigest)||!DIGEST.test(archiveDigest)||
     !SHA.test(clean(evidence.sourceHeadSha,80))||
     evidence.applicationDigestSource!=='staging-validated-immutable-manifest'||
     evidence.requiredCiVerified!==true||evidence.securityReviewVerified!==true||
     evidence.stagingVerified!==true||evidence.rollbackReady!==true||
     !Number.isSafeInteger(evidence.stagingRunId)||evidence.stagingRunId<1||
     !Number.isSafeInteger(evidence.artifactId)||evidence.artifactId<1){
    return fail('preproduction_artifact_contract_invalid');
  }
  const verifiedAt=clean(evidence.verifiedAt,80),verifiedMs=Date.parse(verifiedAt);
  if(!Number.isFinite(verifiedMs)||Math.abs(Date.now()-verifiedMs)>15*60*1000){
    return fail('preproduction_verification_stale');
  }
  let row,previous,priorApproval;
  try{
    row=await db.prepare(
      'SELECT task_id,branch_ref,state,state_version,permission_class,deployment_requested,evidence_json FROM ekodi_orchestrator_tasks WHERE task_id=?'
    ).bind(taskId).first();
    if(!row||row.task_id!==taskId||row.branch_ref!==branchRef||
       row.state!=='staging'||row.permission_class!=='delegated'||
       Number(row.deployment_requested)!==1||!Number.isSafeInteger(Number(row.state_version))||
       Number(row.state_version)<1)return fail('task_not_in_authorized_staging');
    previous=await db.prepare(
      "SELECT actor,reason,evidence_json FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='verified_preproduction_evidence_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
    priorApproval=await db.prepare(
      "SELECT reason FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='final_promotion_approval_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
  }catch{return fail('stage_audit_or_task_lookup_unavailable')}
  if(priorApproval)return fail('approval_already_recorded');
  // A task may receive at most one immutable release identity. Retrying the
  // OIDC job is idempotent only for the same first-party signed audit record.
  if(previous){
    const verified=json(previous.evidence_json);
    if(previous.actor==='ekodi-github-actions-oidc-reconciler'&&
       previous.reason==='verified_preproduction_evidence_recorded'&&
       verified?.authority==='ekodi-orchestrator'&&verified.source==='github-actions-oidc'&&
       verified.taskId===taskId&&verified.branchRef===branchRef&&
       verified.releaseSha===releaseSha&&verified.artifactDigest===artifactDigest&&
       verified.archiveDigest===archiveDigest&&verified.requiredCiVerified===true&&
       verified.stagingVerified===true&&verified.rollbackReady===true&&
       verified.securityReviewVerified===true){
      return Object.freeze({recorded:true,idempotent:true,auditOnly:true,
        approvalGranted:false,taskId,branchRef,releaseSha,artifactDigest,
        productionDeployed:false});
    }
    return fail('conflicting_or_untrusted_stage_attestation');
  }
  const attestation=Object.freeze({
    authority:'ekodi-orchestrator',source:'github-actions-oidc',taskId,branchRef,
    releaseSha,artifactDigest,archiveDigest,verifiedAt,
    requiredCiVerified:true,stagingVerified:true,rollbackReady:true,securityReviewVerified:true,
    stagingRunId:evidence.stagingRunId,artifactId:evidence.artifactId,
    workflowRunId:Number(oidc.runId),workflowRef:oidc.workflowRef,
    reviewHeadSha:clean(evidence.sourceHeadSha,80),
  });
  const nextVersion=Number(row.state_version)+1,updatedAt=new Date().toISOString();
  // Never overwrite task.evidence_json. That is owned by the command ledger,
  // which can refresh it on every progress poll. An independent append-only
  // OIDC audit event is the sole authoritative source of staging proof.
  const update=db.prepare(`UPDATE ekodi_orchestrator_tasks
    SET state_version=state_version+1,updated_at=?
    WHERE task_id=? AND state='staging' AND state_version=? AND branch_ref=?
      AND evidence_json=? AND deployment_requested=1 AND permission_class='delegated'`)
    .bind(updatedAt,taskId,Number(row.state_version),branchRef,row.evidence_json);
  // D1 batch is atomic: a failed CAS forces a NOT NULL constraint failure
  // on the audit INSERT. Never commit a bumped version without its evidence.
  const insert=db.prepare(`INSERT INTO ekodi_orchestrator_task_events
    (task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at)
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM ekodi_orchestrator_tasks WHERE task_id=? AND
        state='staging' AND state_version=? AND evidence_json=?
      ) THEN ? ELSE NULL END,
      COALESCE((SELECT MAX(seq) FROM ekodi_orchestrator_task_events WHERE task_id=?),0)+1,
      'staging','staging','ekodi-github-actions-oidc-reconciler',
      'verified_preproduction_evidence_recorded',?,?`)
    .bind(taskId,nextVersion,row.evidence_json,taskId,taskId,JSON.stringify(attestation),updatedAt);
  try{
    const results=await db.batch([update,insert]);
    if(changes(results?.[0])!==1||changes(results?.[1])!==1)return fail('staging_evidence_transaction_conflict');
  }catch{return fail('staging_evidence_transaction_failed')}
  return Object.freeze({recorded:true,auditOnly:true,
    authority:'ekodi-orchestrator',taskId,branchRef,releaseSha,artifactDigest,
    stateVersion:nextVersion,proofRecorded:true,approvalGranted:false,
    productionDeployed:false});
}
