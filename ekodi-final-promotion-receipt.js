// Exact-artifact promotion receipt: a read-only decision, not a deployment.
// Production release jobs must use this only together with the official
// Orchestrator task, immutable artifact and their existing guardrails.
const TASK=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const DIGEST=/^sha256:[a-f0-9]{64}$/i;
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const deny=reason=>Object.freeze({authorized:false,reason,productionDeployed:false});
const parse=s=>{try{return JSON.parse(s||'{}')}catch{return null}};

export async function verifyEkodiFinalPromotionReceipt(db,input={}){
  const taskId=clean(input.taskId,160),branchRef=clean(input.branchRef,220);
  const releaseSha=clean(input.releaseSha,80),artifactDigest=clean(input.artifactDigest,150);
  if(!TASK.test(taskId)||!BRANCH.test(branchRef)||!branchRef.endsWith('/'+taskId)||
     !SHA.test(releaseSha)||!DIGEST.test(artifactDigest))return deny('invalid_release_artifact_identity');
  if(!db?.prepare)return deny('authoritative_task_database_unavailable');
  let task,stage,approval;
  try{
    task=await db.prepare(
      'SELECT task_id,branch_ref,state,state_version,permission_class,deployment_requested,evidence_json FROM ekodi_orchestrator_tasks WHERE task_id=?'
    ).bind(taskId).first();
    if(!task||task.branch_ref!==branchRef||task.state!=='staging'||
       task.permission_class!=='delegated'||Number(task.deployment_requested)!==1||
       !Number.isSafeInteger(Number(task.state_version))||Number(task.state_version)<1){
      return deny('orchestrator_task_not_releasable');
    }
    stage=await db.prepare(
      "SELECT actor,reason,evidence_json FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='verified_preproduction_evidence_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
    approval=await db.prepare(
      "SELECT actor,reason,evidence_json FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='final_promotion_approval_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
  }catch{return deny('promotion_receipt_lookup_failed')}
  const proof=parse(task.evidence_json)?.preproductionProof;
  const stageAudit=parse(stage?.evidence_json);
  const owner=parse(approval?.evidence_json);
  if(!proof||!stageAudit||!owner)return deny('staging_or_owner_confirmation_missing');
  if(stage.actor!=='ekodi-github-actions-oidc-reconciler'||
     stage.reason!=='verified_preproduction_evidence_recorded'||
     stageAudit.authority!=='ekodi-orchestrator'||stageAudit.source!=='github-actions-oidc'||
     stageAudit.taskId!==taskId||stageAudit.branchRef!==branchRef||
     stageAudit.releaseSha!==releaseSha||stageAudit.artifactDigest!==artifactDigest||
     !Number.isSafeInteger(stageAudit.workflowRunId)||stageAudit.workflowRunId<1||
     proof.authority!=='ekodi-orchestrator'||proof.taskId!==taskId||
     proof.branchRef!==branchRef||proof.releaseSha!==releaseSha||
     proof.artifactDigest!==artifactDigest||proof.verifiedAt!==stageAudit.verifiedAt||
     ![proof.requiredCiVerified,proof.stagingVerified,proof.rollbackReady,proof.securityReviewVerified].every(x=>x===true)){
    return deny('authenticated_preproduction_proof_invalid');
  }
  // Reuse of an old approval or one issued before staging would violate the
  // requested single *final* confirmation for the exact release. No worker
  // may override the freshness window with caller-controlled flags.
  const nowMs=Date.now(),stageMs=Date.parse(proof.verifiedAt),
    ownerMs=Date.parse(owner.approvedAt);
  if(!Number.isFinite(stageMs)||!Number.isFinite(ownerMs)||
     stageMs>ownerMs||ownerMs>nowMs+60_000||
     nowMs-ownerMs>24*60*60*1000){
    return deny('final_owner_confirmation_expired_or_out_of_order');
  }
  if(!/^super-admin:[^\s]+$/.test(clean(approval.actor,300))||
     approval.reason!=='final_promotion_approval_recorded'||
     owner.approved!==true||owner.authority!=='ekodi-orchestrator'||
     owner.scope!=='production_promotion'||owner.approvedByRole!=='super_admin'||
     approval.actor!=='super-admin:'+owner.approvedBy||
     owner.taskId!==taskId||owner.branchRef!==branchRef||
     owner.releaseSha!==releaseSha||owner.artifactDigest!==artifactDigest||
     owner.stateVersion!==Number(task.state_version)||
     owner.approvalId!==`final_promotion_${taskId}_v${owner.stateVersion}`||
     !Number.isFinite(Date.parse(owner.approvedAt))){
    return deny('final_owner_confirmation_missing_or_stale');
  }
  return Object.freeze({
    authorized:true,authority:'ekodi-orchestrator',taskId,branchRef,
    releaseSha,artifactDigest,approvalId:owner.approvalId,
    stateVersion:owner.stateVersion,
    purpose:'guarded-production-promotion-only',
    productionDeployed:false,
  });
}
