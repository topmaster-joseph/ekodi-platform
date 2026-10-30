// Advisory readiness model for EKODI's existing guarded Orchestrator lifecycle.
// NEVER authorize deployment from this function alone: release workers must
// separately verify an authenticated, durable Orchestrator receipt and immutable
// artifact inside the official promotion gate.
export const EKODI_CONTINUOUS_EXECUTION_GATE = Object.freeze({
  policyId: 'EKODI-ONE-FINAL-PROMOTION-CONFIRMATION-001',
  owner: 'ekodi-ai-orchestrator',
  maxAutomaticRetries: 3,
  allowedAutomaticStages: Object.freeze([
    'plan', 'implement', 'test', 'repair', 'retest', 'review',
    'pull-request', 'required-ci', 'staging', 'staging-proof', 'rollback-preflight',
  ]),
  finalStage: 'production-promotion',
  protectedEarlyRisks: Object.freeze([
    'permission_expansion', 'destructive_data', 'security_boundary_change',
    'credential_change', 'identity_ownership', 'paid_commitment',
    'legal_commitment', 'new_independent_deployment',
  ]),
});

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const result = (decision, reason, more = {}) =>
  Object.freeze({ decision, reason, ...more, productionDeployed: false });
const validSha = value => /^[0-9a-f]{40}$/i.test(text(value, 80));

/**
 * Readiness/preflight decision only. The trusted release gateway owns the
 * actual verification of final approval and still must enforce branch/CI,
 * immutable artifact, authorization, staging, rollback and live proof.
 */
export function evaluateEkodiContinuousExecution(input = {}) {
  const phase = text(input.phase, 60);
  const riskFlags = Array.isArray(input.riskFlags) ? input.riskFlags : [];
  const protectedRisk = riskFlags.some(flag =>
    EKODI_CONTINUOUS_EXECUTION_GATE.protectedEarlyRisks.includes(text(flag, 60)));
  // An external worker cannot assert that a mandatory Human Gate is approved.
  // Official Human Gate approval is checked separately by EKODI's task owner.
  if (protectedRisk) {
    return result('await_mandatory_early_gate', 'sovereign_safety_approval_required');
  }

  if (input.ambiguousSideEffect === true && input.sideEffectReconciled !== true) {
    return result('reconcile_before_retry', 'ambiguous_effect_must_be_resolved');
  }

  const attempts = Math.max(0, Math.trunc(Number(input.attempts) || 0));
  if (input.failed === true) {
    if (input.safeToRetry !== true || input.idempotent !== true) {
      return result('hold_with_evidence', 'unsafe_or_nonidempotent_retry');
    }
    if (attempts >= EKODI_CONTINUOUS_EXECUTION_GATE.maxAutomaticRetries) {
      return result('hold_with_evidence', 'retry_budget_exhausted');
    }
    if (input.sideEffectOccurred === true && input.rollbackVerified !== true) {
      return result('reconcile_before_retry', 'prior_side_effect_not_rolled_back');
    }
    return result('auto_repair_and_resume', 'bounded_retry_allowed', {
      remainingAutomaticRetries: EKODI_CONTINUOUS_EXECUTION_GATE.maxAutomaticRetries - attempts,
      resumeAt: phase || 'failed-stage',
    });
  }

  if (EKODI_CONTINUOUS_EXECUTION_GATE.allowedAutomaticStages.includes(phase)) {
    return result('continue_automatically', 'prepromotion_stage', { resumeAt: phase });
  }

  if (phase !== EKODI_CONTINUOUS_EXECUTION_GATE.finalStage) {
    return result('hold_with_evidence', 'unrecognized_or_unsupported_stage');
  }

  const taskId = text(input.taskId, 160);
  const branch = text(input.branchRef, 240);
  const commit = text(input.releaseSha, 80);
  const artifact = text(input.artifactDigest, 240);
  if (!/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(taskId) ||
      !branch.endsWith('/' + taskId) || !/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i.test(branch) ||
      !validSha(commit) || !artifact) {
    return result('hold_with_evidence', 'orchestrator_provenance_or_artifact_missing');
  }
  if (input.requiredCiVerified !== true || input.stagingVerified !== true ||
      input.rollbackReady !== true || input.securityReviewVerified !== true) {
    return result('continue_preproduction_verification', 'mandatory_preproduction_evidence_missing');
  }

  // A caller-provided object/boolean cannot prove an approval. Only the
  // trusted server-side D1 task/event ledger check below may produce the
  // attested promotion-readiness decision.
  return result('await_final_owner_confirmation', 'exact_artifact_owner_approval_required', {
    taskId, branchRef: branch, releaseSha: commit, artifactDigest: artifact,
  });
}

/**
 * Authenticated final-promotion preflight for the first-party server only.
 * The privileged writer and the production release scripts remain separate
 * and MUST verify their own authorization, CI, rollback and immutable release.
 * Never expose this function as a client-invokable command.
 */
export async function evaluateEkodiContinuousExecutionFromLedger(db, input = {}) {
  const preview=evaluateEkodiContinuousExecution(input);
  if(preview.decision!=='await_final_owner_confirmation')return preview;
  if(!db?.prepare)return preview;

  const taskId=preview.taskId, branchRef=preview.branchRef;
  const releaseSha=preview.releaseSha, artifactDigest=preview.artifactDigest;
  let task, event;
  try{
    task=await db.prepare(
      'SELECT task_id,branch_ref,state,state_version,permission_class,deployment_requested,evidence_json FROM ekodi_orchestrator_tasks WHERE task_id=?'
    ).bind(taskId).first();
    if(!task || task.branch_ref!==branchRef ||
       Number(task.deployment_requested)!==1 || task.permission_class!=='delegated' ||
       task.state!=='staging' ||
       !Number.isInteger(Number(task.state_version)) || Number(task.state_version)<1){
      return preview;
    }
    const preproductionStageEvent=await db.prepare(
      "SELECT actor,reason,evidence_json FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='verified_preproduction_evidence_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
    if(preproductionStageEvent?.actor!=='ekodi-github-actions-oidc-reconciler')return preview;
    let staged;
    try{staged=JSON.parse(preproductionStageEvent.evidence_json||'{}')}catch{return preview}
    if(staged?.authority!=='ekodi-orchestrator'||staged.source!=='github-actions-oidc'||
       staged.taskId!==taskId||staged.branchRef!==branchRef||
       staged.releaseSha!==releaseSha||staged.artifactDigest!==artifactDigest||
       !/^sha256:[a-f0-9]{64}$/i.test(text(staged.archiveDigest,150))||
       !Number.isFinite(Date.parse(staged.verifiedAt))||
       ![staged.requiredCiVerified,staged.stagingVerified,
         staged.rollbackReady,staged.securityReviewVerified].every(x=>x===true)||
       !Number.isSafeInteger(staged.workflowRunId)||staged.workflowRunId<1)return preview;
    event=await db.prepare(
      "SELECT actor,reason,evidence_json FROM ekodi_orchestrator_task_events WHERE task_id=? AND reason='final_promotion_approval_recorded' ORDER BY seq DESC LIMIT 1"
    ).bind(taskId).first();
  }catch{
    return preview;
  }
  if(!event || event.reason!=='final_promotion_approval_recorded' ||
     !/^super-admin:[^\s]+$/.test(String(event.actor||'')))return preview;

  let receipt;
  try{receipt=JSON.parse(event.evidence_json||'{}')}catch{return preview}
  if(receipt?.approved!==true || receipt.authority!=='ekodi-orchestrator' ||
     receipt.approvedByRole!=='super_admin' || receipt.scope!=='production_promotion' ||
     receipt.taskId!==taskId || receipt.branchRef!==branchRef ||
     receipt.releaseSha!==releaseSha || receipt.artifactDigest!==artifactDigest ||
     !Number.isInteger(receipt.stateVersion) ||
     receipt.stateVersion!==Number(task.state_version) ||
     !text(receipt.approvedAt,80) || !text(receipt.approvalId,240) ||
     receipt.approvalId!==`final_promotion_${taskId}_v${receipt.stateVersion}` ||
     String(event.actor).slice('super-admin:'.length)!==String(receipt.approvedBy||''))return preview;
  return result('ready_for_guarded_promotion','durable_task_approval_verified',{
    taskId,branchRef,releaseSha,artifactDigest,
    approvalId:receipt.approvalId,
    requiresSeparateOfficialReleaseGate:true,
  });
}
