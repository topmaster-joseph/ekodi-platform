import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COGNITIVE_CONTROL_POLICY,
  evaluateControlIntent,
  getControlPlaneSummary,
  isImmutableArtifactId,
} from '../cognitive-control-plane.js';
import {
  getWorkloadIngressContract,
  normalizeWorkloadEvent,
  planWorkloadEvent,
  validateWorkloadEvent,
} from '../ai-control-workload-ingress.js';

const verifiedArtifact = Object.freeze({
  id: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  immutable: true,
  verified: true,
});
const fullGates = [...COGNITIVE_CONTROL_POLICY.requiredPromotionGates];
const fullMigrationGates = [...COGNITIVE_CONTROL_POLICY.requiredMigrationGates];

function mallWorkload(overrides = {}) {
  return normalizeWorkloadEvent({
    event_id: 'evt-mall-001',
    event_type: 'mall.product.promotion.requested',
    event_version: 1,
    occurred_at: '2026-09-02T00:00:00.000Z',
    scope: { type: 'platform_service', id: 'ekodi-mall' },
    source: { service_id: 'ekodi-mall', adapter_id: 'mall.growth-loop' },
    actor: { type: 'system', id: 'growth-loop' },
    subject: { type: 'product', id: 'product-001' },
    correlation_id: 'campaign-001',
    payload: { product_name: '테스트 상품', tracked_url: 'https://ekodi.kr/mall' },
    ...overrides,
  }, '2026-09-02T00:00:01.000Z');
}

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
    superAdminAuthorized: true,
    artifact: verifiedArtifact,
    gates: fullGates,
  });
  assert.equal(result.decision, 'allow');
  assert.equal(result.reason, 'verified_artifact_promotion');
});

test('production promotion cannot execute without Platform Super Administrator approval', () => {
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
  assert.equal(result.decision, 'super_admin_gate');
  assert.equal(result.reason, 'platform_super_admin_approval_required');
  assert.equal(result.approvalAuthority, 'ekodi_platform_super_administrator');
});

test('production promotion fails closed when one gate is missing', () => {
  const result = evaluateControlIntent({
    actor: 'Release AI',
    actorPlane: 'governance',
    operation: 'promote',
    sourceEnvironment: 'verification',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    superAdminAuthorized: true,
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
    superAdminAuthorized: true,
    rebuildOnPromotion: true,
    artifact: verifiedArtifact,
    gates: fullGates,
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'production_rebuild_forbidden');
});

test('governed additive migration is a separate production data lane', () => {
  const result = evaluateControlIntent({
    actor: 'Migration Controller',
    actorPlane: 'governance',
    operation: 'migrate-additive',
    sourceEnvironment: 'verification',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    superAdminAuthorized: true,
    audited: true,
    artifact: verifiedArtifact,
    gates: fullMigrationGates,
  });
  assert.equal(result.decision, 'allow');
  assert.equal(result.reason, 'governed_additive_migration');
});

test('additive migration fails closed without a recovery point', () => {
  const result = evaluateControlIntent({
    actor: 'Migration Controller',
    actorPlane: 'governance',
    operation: 'migrate-additive',
    sourceEnvironment: 'verification',
    targetEnvironment: 'production',
    governanceAuthorized: true,
    superAdminAuthorized: true,
    audited: true,
    artifact: verifiedArtifact,
    gates: fullMigrationGates.filter(gate => gate !== 'recovery-point'),
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'migration_gates_incomplete');
  assert.deepEqual(result.missingGates, ['recovery-point']);
});

test('production rollback requires Platform Super Administrator approval', () => {
  const result = evaluateControlIntent({
    actor: 'DevOps AI',
    actorPlane: 'governance',
    operation: 'rollback',
    sourceEnvironment: 'production',
    targetEnvironment: 'production',
    audited: true,
  });
  assert.equal(result.decision, 'super_admin_gate');
  assert.equal(result.reason, 'high_impact_change');
  assert.equal(result.approvalAuthority, 'ekodi_platform_super_administrator');
});

test('repository force push stays super-admin-gated even outside production', () => {
  const result = evaluateControlIntent({
    actor: 'Development AI',
    actorPlane: 'execution',
    operation: 'repository-force-push',
    sourceEnvironment: 'development',
    targetEnvironment: 'development',
  });
  assert.equal(result.decision, 'super_admin_gate');
  assert.equal(result.reason, 'high_impact_change');
  assert.equal(result.approvalAuthority, 'ekodi_platform_super_administrator');
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

test('summary exposes four-plane path and EKODI authority model', () => {
  const summary = getControlPlaneSummary();
  assert.equal(summary.taskOwner, 'ekodi_orchestrator');
  assert.equal(summary.entryAiRole, 'entry_point_and_bounded_participant');
  assert.equal(summary.finalPlatformAuthority, 'ekodi_platform_super_administrator');
  assert.deepEqual(summary.planes, ['control', 'governance', 'execution', 'data']);
  assert.deepEqual(summary.promotionPath, ['development', 'verification', 'production']);
  assert.equal(summary.productionMutationMode, 'promotion-only');
  assert.equal(summary.productionDataSchemaMode, 'governed-additive-migration-only');
  assert.equal(summary.rebuildOnPromotion, false);
});

test('workload ingress exposes an independent service-to-control-plane contract', () => {
  const contract = getWorkloadIngressContract();
  assert.equal(contract.authentication, 'independent_service_caller');
  assert.equal(contract.credentialsInPayload, false);
  assert.deepEqual(contract.supportedScopes, ['workspace', 'platform_service']);
  assert.ok(contract.supportedEvents.includes('mall.product.promotion.requested'));
});

test('Mall workload uses platform_service scope without a fake workspace', () => {
  const event = mallWorkload();
  assert.equal(validateWorkloadEvent(event).ok, true);
  assert.deepEqual(event.scope, { type: 'platform_service', id: 'ekodi-mall' });
  assert.equal(event.workspaceId, '');
  assert.equal(event.source.serviceId, 'ekodi-mall');
});

test('platform_service scope cannot impersonate another service or carry workspace identity', () => {
  const wrongService = mallWorkload({ scope: { type: 'platform_service', id: 'other-service' } });
  assert.equal(validateWorkloadEvent(wrongService).code, 'workload_service_scope_invalid');
  const fakeWorkspace = mallWorkload({ workspace_id: 'workspace-mall-proof' });
  assert.equal(validateWorkloadEvent(fakeWorkspace).code, 'workload_service_scope_invalid');
});

test('workspace scope requires the same immutable workspace identity', () => {
  const valid = normalizeWorkloadEvent({
    event_id: 'evt-workspace-001',
    event_type: 'mall.product.promotion.requested',
    workspace_id: '25d0a2d7-7e52-47bc-abc7-b2fcc46b3070',
    scope: { type: 'workspace', id: '25d0a2d7-7e52-47bc-abc7-b2fcc46b3070' },
    source: { service_id: 'ekodi-mall' },
    subject: { type: 'product', id: 'product-001' },
  });
  assert.equal(validateWorkloadEvent(valid).ok, true);
  const invalid = normalizeWorkloadEvent({
    event_id: 'evt-workspace-002',
    event_type: 'mall.product.promotion.requested',
    workspace_id: '25d0a2d7-7e52-47bc-abc7-b2fcc46b3070',
    scope: { type: 'workspace', id: 'different-workspace' },
    source: { service_id: 'ekodi-mall' },
    subject: { type: 'product', id: 'product-001' },
  });
  assert.equal(validateWorkloadEvent(invalid).code, 'workload_workspace_scope_invalid');
});

test('workload ingress rejects credentials from business payloads', () => {
  const event = mallWorkload({ payload: { nested: { refresh_token: 'never-store-this' } } });
  const validation = validateWorkloadEvent(event);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'workload_secret_forbidden');
});

test('Mall promotion plan keeps public YouTube publication behind a human gate', () => {
  const plan = planWorkloadEvent(mallWorkload());
  assert.equal(plan.goal, 'promote_product');
  assert.deepEqual(plan.scope, { type: 'platform_service', id: 'ekodi-mall' });
  assert.equal(plan.workspaceId, '');
  assert.equal(plan.executionBoundary, 'capability_adapters_only');
  assert.equal(plan.executionReady, false);
  assert.deepEqual(plan.steps.map(step => step.capability), [
    'campaign.compose',
    'media.render.short_video',
    'publisher.youtube.private',
    'analytics.observe',
    'publisher.youtube.public',
  ]);
  assert.equal(plan.steps.at(-1).approvalRequired, true);
  assert.equal(plan.steps.at(-1).status, 'awaiting_human');
});
