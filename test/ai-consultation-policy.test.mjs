import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ai-change-orchestration-policy.json'), 'utf8'));

test('consultation policy is need-based rather than always-parallel', () => {
  assert.equal(policy.execution.alwaysParallel, false);
  assert.equal(policy.execution.collaborationMode, 'adaptive');
  assert.equal(policy.consultationDecision.policyId, 'AI-CONSULT-001');
  assert.equal(policy.consultationDecision.mode, 'need-and-risk-based');
});

test('consultation completion requires actual evidence and private reasoning stays excluded', () => {
  assert.equal(policy.consultationDecision.plannedAndActualProvidersMustBeSeparate, true);
  assert.equal(policy.consultationDecision.completionClaimRequiresActualExecutionEvidence, true);
  assert.equal(policy.consultationDecision.zeroActualCallsMayNotClaimConsultationCompleted, true);
  assert.equal(policy.consultationDecision.privateReasoningExcluded, true);
  assert.equal(policy.consultationDecision.receiptRequired, true);
});

test('high-impact categories cannot silently skip consultation', () => {
  const forced = new Set(policy.consultationDecision.forcedMultiConsultCategories);
  for (const category of ['authentication', 'authorization', 'security', 'secrets', 'payment', 'permission', 'data_migration', 'destructive_data', 'production', 'deployment', 'dns']) {
    assert.equal(forced.has(category), true, category);
  }
});


test('deployment validation is exposed as three gates while retaining internal checks', () => {
  const model = policy.deploymentGateModel;
  assert.equal(model.policyId, 'EKODI-DEPLOY-3GATE-001');
  assert.deepEqual(model.publicSequence, ['build', 'release', 'production']);
  assert.equal(model.detailedLifecycleRemainsAuditable, true);
  assert.equal(model.duplicateChecksMustBeDeduplicated, true);
  assert.equal(model.samePurposeChecksRunInsideOneGate, true);
  assert.equal(model.parallelizeIndependentChecks, true);
  assert.deepEqual(model.riskRouting.low.publicGates, ['build', 'production']);
  assert.deepEqual(model.riskRouting.low.collapsedGates, ['release']);
  assert.deepEqual(model.riskRouting.normal.publicGates, ['build', 'release', 'production']);
  assert.equal(model.riskRouting.high.independentVerificationRequired, true);
  assert.equal(model.riskRouting.critical.humanGateWhenIndependentVerificationUnavailable, true);
});

test('three-gate simplification never weakens production completion or must-pass safety checks', () => {
  const model = policy.deploymentGateModel;
  assert.equal(model.completion.productionEvidenceRequiredWhenDeploymentRequested, true);
  assert.equal(model.completion.liveFunctionalVerificationRequired, true);
  assert.equal(model.completion.deployCommandAloneNeverMeansDone, true);
  assert.equal(model.consultationBehavior.providerFailureMayNotBypassMustPassChecks, true);
  assert.equal(policy.consultationDecision.executionBlockingRules.lowNormalProviderFailureIsAdvisory, true);
  assert.equal(policy.consultationDecision.executionBlockingRules.mustPassSafetyChecksRemainBlocking, true);
});
