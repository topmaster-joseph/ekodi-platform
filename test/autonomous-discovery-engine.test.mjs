import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EKODI_AUTONOMOUS_DISCOVERY_POLICY,
  buildResearchProgram,
  evaluateGeneration11Candidate,
  governDiscoveryAction,
  runAutonomousDiscoveryCycle,
} from '../ekodi-autonomous-discovery-engine.js';

test('discovers a future risk before production impact and creates a bounded research program', () => {
  const program = buildResearchProgram({
    type: 'forecast_capacity_risk',
    target: 'auth-service',
    riskPct: 78,
    detectedAt: '2026-09-11T00:00:00Z',
    evidenceRefs: ['metric:auth-capacity-forecast'],
  });
  assert.ok(program);
  assert.equal(program.status, 'research_candidate');
  assert.equal(program.experiment.environment, 'isolated_sandbox');
  assert.equal(program.experiment.productionMutationAllowed, false);
  assert.equal(program.experiment.authorityExpansionAllowed, false);
});

test('low-risk discovery and research phases can run autonomously', () => {
  for (const phase of ['observe', 'anticipate', 'discover', 'question', 'research', 'evaluate', 'recommend']) {
    const decision = governDiscoveryAction({ phase });
    assert.equal(decision.allowedAutonomously, true, phase);
    assert.equal(decision.mode, 'autonomous_research', phase);
  }
});

test('bounded isolated reversible experiments can run without a production grant', () => {
  const decision = governDiscoveryAction({
    phase: 'experiment',
    isolated: true,
    reversible: true,
    delegated: true,
    logged: true,
    preflightVerified: true,
    withinBudget: true,
    sensitiveDataExpansion: false,
  });
  assert.equal(decision.allowedAutonomously, true);
  assert.equal(decision.mode, 'autonomous_sandbox_experiment');
});

test('production, permission and sovereign authority changes remain human-gated', () => {
  const production = governDiscoveryAction({ phase: 'evolve', productionChange: true, reversible: true, delegated: true, logged: true, preflightVerified: true });
  const permission = governDiscoveryAction({ phase: 'evolve', permissionExpansion: true });
  const authority = governDiscoveryAction({ phase: 'research', authorityExpansion: true });
  assert.equal(production.mode, 'human_gate');
  assert.equal(permission.mode, 'human_gate');
  assert.equal(authority.mode, 'human_gate');
  assert.equal(production.allowedAutonomously, false);
  assert.equal(authority.reason, 'sovereign_authority_cannot_self_expand');
});

test('11G candidate test never promotes itself and falls back to Generation 10 when evidence is incomplete', () => {
  const result = evaluateGeneration11Candidate({ dimensions: {}, checks: {} });
  assert.equal(result.candidateReady, false);
  assert.equal(result.status, 'generation_10_safe_mode');
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.officialTargetName, null);
});

test('complete high-quality evidence only reaches super-admin review, never automatic promotion', () => {
  const dimensions = Object.fromEntries(EKODI_AUTONOMOUS_DISCOVERY_POLICY.certificationDimensions.map(id => [id, 97]));
  const checks = Object.fromEntries(EKODI_AUTONOMOUS_DISCOVERY_POLICY.certificationChecks.map(id => [id, true]));
  const result = evaluateGeneration11Candidate({ dimensions, checks });
  assert.equal(result.candidateReady, true);
  assert.equal(result.status, 'generation_11_candidate_ready_for_super_admin_review');
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.finalAuthority, 'ekodi_platform_super_administrator');
});

test('discovery cycle does not mutate production or expand authority', () => {
  const result = runAutonomousDiscoveryCycle({
    signals: [
      { type: 'repeated_error_pattern', target: 'admin-api', count: 5 },
      { type: 'cost_performance_drift', target: 'ai-gateway', driftPct: 26 },
    ],
  });
  assert.equal(result.discovered, 2);
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.authorityExpanded, false);
});
