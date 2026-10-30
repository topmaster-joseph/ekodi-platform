// First-party, authenticated Orchestrator-only final promotion approval writer.
// Never a deployment command. Invoke only after server-side super-admin identity,
// ai:operate permission and same-origin checks. D1 batch is atomic.
import { evaluateEkodiContinuousExecution } from './ekodi-continuous-execution-gate.js';

const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const sha=/^[0-9a-f]{40}$/i;
const digest=/^sha256:[0-9a-f]{64}$/i;
const taskPattern=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const branchPattern=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const result=(approved,reason,extra={})=>Object.freeze({approved,reason,productionDeployed:false,...extra});
const changes=x=>Number(x?.meta?.changes??x?.changes??0);
const parse=x=>{try{return JSON.parse(x||'{}')}catch{return {}}};

/**
 * There is no client-assertable "preproductionVerified" or approval override.
 * This writer reads the separately authenticated OIDC staging-event ledger,
 * never mutable command progress evidence, then uses CAS and atomic audit.
 */
export async function recordEkodiFinalPromotionApproval(db,input={}){
  const taskId=clean(input.taskId,160);
  const releaseSha=clean(input.releaseSha,80);
  const artifactDigest=clean(input.artifactDigest,150);
  const actor=clean(input.authorizedSuperAdminPersonId,160);
  const expectedStateVersion=Number(input.expectedStateVersion);
  if(!db?.prepare||typeof db.batch!=='function')return result(false,'orchestrator_database_unavailable');
  if(!taskPattern.test(taskId)||!sha.test(releaseSha)||!digest.test(artifactDigest)||
     !actor.startsWith('platform-admin:')||actor.length<16||
     !Number.isSafeInteger(expectedStateVersion)||expectedStateVersion<1){
    return result(false,'invalid_or_unauthorized_final_promotion_request');
  }
  let row;
  try{
    row=await db.prepare('SELECT task_id,branch_ref,state,state_version,permission_class,deployment_requested,evidence_json FROM ekodi_orchestrator_tasks WHERE task_id=?').bind(taskId).first();
  }catch{return result(false,'orchestrator_task_lookup_unavailable')}
  if(!row)return result(false,'task_not_found');
  const branchRef=clean(row.branch_ref,220);
  if(row.task_id!==taskId||!branchPattern.test(branchRef)||!branchRef.endsWith('/'+taskId)||
     row.state!=='staging'||row.permission_class!=='delegated'||
     Number(row.deployment_requested)!==1){
    return result(false,'task_not_in_authorized_staging');
  }
  if(Number(row.state_version)!==expectedStateVersion)return result(false,'stale_task_state');
  // A worker-controlled task evidence object is NOT authoritative by itself.
  // Only a matching first-party OIDC-verified preproduction audit event may
  // allow owner approval; staging validation must independently write it.
  let stagedEvent;
  try{
    stagedEvent=await db.prepare(
      "SELECT actor,reason,evidence_json FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='verified_preproduction_evidence_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
  }catch{return result(false,'preproduction_attestation_lookup_failed')}
  if(stagedEvent?.actor!=='ekodi-github-actions-oidc-reconciler' ||
     stagedEvent?.reason!=='verified_preproduction_evidence_recorded'){
    return result(false,'verified_staging_attestation_missing');
  }
  // Idempotency is task-scoped, never approvalId-scoped. This inexpensive
  // read avoids unnecessary D1 writes; the atomic INSERT below independently
  // blocks a concurrent second approver that raced this check.
  try{
    const existing=await db.prepare(
      "SELECT id FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='final_promotion_approval_recorded' LIMIT 1"
    ).bind(taskId).first();
    if(existing)return result(false,'final_promotion_approval_already_recorded');
  }catch{return result(false,'final_promotion_approval_lookup_unavailable')}
  const attestation=parse(stagedEvent.evidence_json);
  if(attestation.authority!=='ekodi-orchestrator' ||
     attestation.source!=='github-actions-oidc' ||
     attestation.taskId!==taskId || attestation.branchRef!==branchRef ||
     attestation.releaseSha!==releaseSha || attestation.artifactDigest!==artifactDigest ||
     !digest.test(clean(attestation.archiveDigest,150)) ||
     !Number.isFinite(Date.parse(attestation.verifiedAt)) ||
     !Number.isSafeInteger(attestation.workflowRunId) || attestation.workflowRunId<1 ||
     ![attestation.requiredCiVerified,attestation.stagingVerified,
       attestation.rollbackReady,attestation.securityReviewVerified].every(x=>x===true)){
    return result(false,'staging_attestation_mismatch');
  }
  const preview=evaluateEkodiContinuousExecution({
    phase:'production-promotion',taskId,branchRef,releaseSha,artifactDigest,
    requiredCiVerified:attestation.requiredCiVerified===true,
    stagingVerified:attestation.stagingVerified===true,
    rollbackReady:attestation.rollbackReady===true,
    securityReviewVerified:attestation.securityReviewVerified===true,
  });
  if(preview.decision!=='await_final_owner_confirmation')return result(false,'prepromotion_gates_incomplete');

  const stateVersion=expectedStateVersion+1;
  const approvedAt=new Date().toISOString();
  const approvalId=`final_promotion_${taskId}_v${stateVersion}`;
  const receipt={
    kind:'final-production-promotion-approval',approved:true,
    authority:'ekodi-orchestrator',scope:'production_promotion',
    taskId,branchRef,releaseSha,artifactDigest,
    approvedByRole:'super_admin',approvedBy:actor,
    approvalId,stateVersion,approvedAt,
  };
  // Every task receives at most ONE final owner confirmation. A reissued
  // approval with a new stateVersion/approvalId must never reset its TTL.
  // The guard checks all historical final_promotion_approval_recorded events.
  // Fail the D1 transaction (NOT NULL event.task_id) if the CAS did not
  // persist or the audit already exists. An INSERT of zero rows would otherwise
  // silently commit a version bump without a durable approval.
  const update=db.prepare(`UPDATE ekodi_orchestrator_tasks SET state_version=state_version+1,updated_at=?
    WHERE task_id=? AND state='staging' AND state_version=? AND branch_ref=?
    AND evidence_json=? AND permission_class='delegated' AND deployment_requested=1`)
    .bind(approvedAt,taskId,expectedStateVersion,branchRef,row.evidence_json);
  const insert=db.prepare(`INSERT INTO ekodi_orchestrator_task_events
    (task_id,seq,from_state,to_state,actor,reason,evidence_json,created_at)
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM ekodi_orchestrator_tasks
        WHERE task_id=? AND state='staging' AND state_version=?
          AND branch_ref=? AND evidence_json=?
      ) AND NOT EXISTS (
        SELECT 1 FROM ekodi_orchestrator_task_events
        WHERE task_id=? AND reason='final_promotion_approval_recorded'
      ) THEN ? ELSE NULL END,
      COALESCE((SELECT MAX(seq) FROM ekodi_orchestrator_task_events WHERE task_id=?),0)+1,
      'staging','staging',?,'final_promotion_approval_recorded',?,?`)
    .bind(taskId,stateVersion,branchRef,row.evidence_json,taskId,taskId,taskId,
      `super-admin:${actor}`,JSON.stringify(receipt),approvedAt);
  try{
    const operations=await db.batch([update,insert]);
    if(changes(operations?.[0])!==1||changes(operations?.[1])!==1){
      return result(false,'state_conflict_or_audit_write_not_confirmed');
    }
  }catch{return result(false,'final_promotion_approval_transaction_failed')}
  return result(true,'durable_final_promotion_approval_recorded',{
    taskId,stateVersion,branchRef,releaseSha,artifactDigest,approvalId,
    requiresSeparateOfficialReleaseGate:true,
  });
}
