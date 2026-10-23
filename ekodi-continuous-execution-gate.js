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
  if (protectedRisk && input.separateSafetyApprovalVerified !== true) {
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

  // Only an approval already validated by the trusted EKODI authority is
  // eligible. Client-submitted fields, simulated reviews and model text are not.
  const approval = input.trustedOrchestratorConfirmation;
  if (!approval || approval.verifiedByTrustedServer !== true ||
      approval.authority !== 'ekodi-orchestrator' ||
      approval.approvedByRole !== 'super_admin' ||
      approval.scope !== 'production_promotion' ||
      approval.taskId !== taskId || approval.branchRef !== branch ||
      approval.releaseSha !== commit || approval.artifactDigest !== artifact ||
      !Number.isInteger(approval.stateVersion) || approval.stateVersion < 1 ||
      !text(approval.approvedAt, 80)) {
    return result('await_final_owner_confirmation', 'exact_artifact_owner_approval_required', {
      taskId, branchRef: branch, releaseSha: commit, artifactDigest: artifact,
    });
  }
  return result('ready_for_guarded_promotion', 'attested_final_confirmation_present', {
    taskId, branchRef: branch, releaseSha: commit, artifactDigest: artifact,
    requiresSeparateOfficialReleaseGate: true,
  });
}
