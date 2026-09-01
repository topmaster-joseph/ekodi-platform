import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COGNITIVE_CONTROL_POLICY,
  evaluateControlIntent,
  getControlPlaneSummary,
  isImmutableArtifactId,
} from '../cognitive-control-plane.js';

const verifiedArtifact = Object.freeze({
  id: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  immutable: true,
  verified: true,
});
const fullGates = [...COGNITIVE_CONTROL_POLICY.requiredPromotionGates];

test('control plane cannot directly mutate production', () => {
  const result = evaluateControlIntent({
    actor: 'Chief AI',
    actorPlane: 'control',
    operation: 'execute',
    targetEnvironment: 'production',
    audited: true,
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'direct_production_mutation_forbidden');
});

test('production promotion requires verification origin', () => {
  const result = evaluateControlIntent({
    actor: 'Release AI',
    actorPlane: 'governance',
    operation: 'promote',
    sourceEnvironment: 'development',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    artifact: verifiedArtifact,
    gates: fullGates,
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'verification_required');
});

test('verified immutable artifact may be promoted without rebuild', () => {
  const result = evaluateControlIntent({
    actor: 'Release AI',
    actorPlane: 'governance',
    operation: 'promote',
    sourceEnvironment: 'verification',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    artifact: verifiedArtifact,
    gates: fullGates,
  });
  assert.equal(result.decision, 'allow');
  assert.equal(result.reason, 'verified_artifact_promotion');
});

test('production promotion fails closed when one gate is missing', () => {
  const result = evaluateControlIntent({
    actor: 'Release AI',
    actorPlane: 'governance',
    operation: 'promote',
    sourceEnvironment: 'verification',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    artifact: verifiedArtifact,
    gates: fullGates.filter(gate => gate !== 'security'),
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'promotion_gates_incomplete');
  assert.deepEqual(result.missingGates, ['security']);
});

test('production rebuild is forbidden even after successful verification', () => {
  const result = evaluateControlIntent({
    actor: 'Release AI',
    actorPlane: 'governance',
    operation: 'promote',
    sourceEnvironment: 'verification',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    rebuildOnPromotion: true,
    artifact: verifiedArtifact,
    gates: fullGates,
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'production_rebuild_forbidden');
});

test('production rollback is a human gate', () => {
  const result = evaluateControlIntent({
    actor: 'DevOps AI',
    actorPlane: 'governance',
    operation: 'rollback',
    sourceEnvironment: 'production',
    targetEnvironment: 'production',
    audited: true,
  });
  assert.equal(result.decision, 'human_gate');
  assert.equal(result.reason, 'high_impact_production_change');
});

test('read-only audited production observation stays available', () => {
  const result = evaluateControlIntent({
    actor: 'Observability AI',
    actorPlane: 'control',
    operation: 'observe',
    sourceEnvironment: 'production',
    targetEnvironment: 'production',
    readOnly: true,
    audited: true,
  });
  assert.equal(result.decision, 'allow');
  assert.equal(result.reason, 'production_observation');
});

test('source-changing development work must be isolated', () => {
  const result = evaluateControlIntent({
    actor: 'Development AI',
    actorPlane: 'execution',
    operation: 'execute',
    sourceEnvironment: 'development',
    targetEnvironment: 'development',
    sourceChange: true,
    sourceIsolated: false,
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'source_isolation_required');
});

test('artifact identities are immutable identifiers, not mutable tags', () => {
  assert.equal(isImmutableArtifactId(verifiedArtifact.id), true);
  assert.equal(isImmutableArtifactId('latest'), false);
  assert.equal(isImmutableArtifactId('main'), false);
});

test('summary exposes four-plane path', () => {
  const summary = getControlPlaneSummary();
  assert.deepEqual(summary.planes, ['control', 'governance', 'execution', 'data']);
  assert.deepEqual(summary.promotionPath, ['development', 'verification', 'production']);
  assert.equal(summary.productionMutationMode, 'promotion-only');
  assert.equal(summary.rebuildOnPromotion, false);
});
