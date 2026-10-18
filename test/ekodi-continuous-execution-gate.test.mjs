import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateEkodiContinuousExecution, EKODI_CONTINUOUS_EXECUTION_GATE } from '../ekodi-continuous-execution-gate.js';

const policy = JSON.parse(readFileSync(new URL('../config/ai-change-orchestration-policy.json', import.meta.url), 'utf8'));
const rule = policy.deploymentMinimumFriction.oneFinalPromotionConfirmation;
const taskId = 'orch_test_1234567890abcdef12345678';
const branchRef = 'ai/claude/' + taskId;
const releaseSha = 'a'.repeat(40);
const artifactDigest = 'sha256:' + 'b'.repeat(64);
const ready = {
  phase: 'production-promotion', taskId, branchRef, releaseSha, artifactDigest,
  requiredCiVerified: true, stagingVerified: true, rollbackReady: true, securityReviewVerified: true,
};
const receipt = {
  verifiedByTrustedServer: true, authority: 'ekodi-orchestrator',
  approvedByRole: 'super_admin', scope: 'production_promotion',
  taskId, branchRef, releaseSha, artifactDigest, stateVersion: 3,
  approvedAt: '2026-10-18T06:30:00Z',
};

test('one owner confirmation remains a machine enforced policy proposal, not an external AI privilege', () => {
  assert.equal(rule.status, 'enforced');
  assert.equal(rule.ownerFacingApprovalMoments, 'one-at-final-production-promotion');
  assert.equal(rule.confirmationDoesNotReplaceMandatoryEarlierHumanGates, true);
  assert.equal(rule.finalPromotionByEkodiOrchestratorOnly, true);
  assert.equal(policy.multiAiCommandAuthority.providerMayPromoteMergeOrDeployDirectly, false);
  assert.equal(rule.finalConfirmationOnlyAfterAllRequiredGatesAndStaging, true);
  assert.equal(EKODI_CONTINUOUS_EXECUTION_GATE.policyId, rule.policyId);
  assert.equal(EKODI_CONTINUOUS_EXECUTION_GATE.maxAutomaticRetries, 3);
});

for (const phase of EKODI_CONTINUOUS_EXECUTION_GATE.allowedAutomaticStages) {
  test(`stage ${phase} proceeds without repeatedly asking the owner`, () => {
    const result = evaluateEkodiContinuousExecution({ phase });
    assert.equal(result.decision, 'continue_automatically');
    assert.equal(result.productionDeployed, false);
  });
}

test('safe deterministic error automatically repairs then resumes only the failed stage', () => {
  const result = evaluateEkodiContinuousExecution({
    phase: 'retest', failed: true, safeToRetry: true, idempotent: true, attempts: 1,
  });
  assert.equal(result.decision, 'auto_repair_and_resume');
  assert.equal(result.resumeAt, 'retest');
  assert.equal(result.remainingAutomaticRetries, 2);
});

test('unsafe, ambiguous, or exhausted retry never fans out blindly', () => {
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', failed: true, safeToRetry: false, idempotent: false,
  }).decision, 'hold_with_evidence');
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', failed: true, safeToRetry: true, idempotent: true, attempts: 3,
  }).reason, 'retry_budget_exhausted');
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', ambiguousSideEffect: true,
  }).decision, 'reconcile_before_retry');
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', failed: true, safeToRetry: true, idempotent: true,
    sideEffectOccurred: true,
  }).reason, 'prior_side_effect_not_rolled_back');
});

test('mandatory early owner/safety gates remain in force for protected risks', () => {
  for (const risk of EKODI_CONTINUOUS_EXECUTION_GATE.protectedEarlyRisks) {
    assert.equal(evaluateEkodiContinuousExecution({ phase: 'implement', riskFlags: [risk] }).decision, 'await_mandatory_early_gate');
  }
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'implement', riskFlags: ['destructive_data'], separateSafetyApprovalVerified: true,
  }).decision, 'continue_automatically');
});

test('final confirmation is not requested before authoritative CI, staging, rollback and provenance', () => {
  assert.equal(evaluateEkodiContinuousExecution({ phase: 'production-promotion' }).reason, 'orchestrator_provenance_or_artifact_missing');
  assert.equal(evaluateEkodiContinuousExecution({
    ...ready, stagingVerified: false,
  }).decision, 'continue_preproduction_verification');
  assert.equal(evaluateEkodiContinuousExecution({
    ...ready, requiredCiVerified: false,
  }).decision, 'continue_preproduction_verification');
});

test('last owner confirmation is required for the exact production artifact only', () => {
  const decision = evaluateEkodiContinuousExecution(ready);
  assert.equal(decision.decision, 'await_final_owner_confirmation');
  assert.equal(decision.taskId, taskId);
  assert.equal(decision.releaseSha, releaseSha);
  assert.equal(decision.productionDeployed, false);
});

test('client-supplied approval fields, mismatched SHA and stale state all fail closed', () => {
  const attempts = [
    { ...receipt, verifiedByTrustedServer: false },
    { ...receipt, approvedByRole: 'worker' },
    { ...receipt, taskId: 'orch_fake_1234567890abcdef12345678' },
    { ...receipt, releaseSha: 'c'.repeat(40) },
    { ...receipt, branchRef: 'ai/chatgpt/' + taskId },
    { ...receipt, stateVersion: 0 },
    { ...receipt, approvedAt: '' },
  ];
  for (const confirmation of attempts) {
    assert.equal(evaluateEkodiContinuousExecution({
      ...ready, trustedOrchestratorConfirmation: confirmation,
    }).decision, 'await_final_owner_confirmation');
  }
});

test('attested approval advances only to guarded production promotion, never directly deploys', () => {
  const decision = evaluateEkodiContinuousExecution({
    ...ready, trustedOrchestratorConfirmation: receipt,
  });
  assert.equal(decision.decision, 'ready_for_guarded_promotion');
  assert.equal(decision.requiresSeparateOfficialReleaseGate, true);
  assert.equal(decision.productionDeployed, false);
});

test('unknown stages are not treated as production-ready', () => {
  assert.equal(evaluateEkodiContinuousExecution({ phase: 'magic-deploy' }).decision, 'hold_with_evidence');
});
