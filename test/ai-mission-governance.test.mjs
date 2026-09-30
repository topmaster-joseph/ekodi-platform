import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MISSION_POLICY, canChiefOverride, evaluateAgentAction } from '../ai-governance.js';
import { AI_MISSION_RUNTIME } from '../ai-governance-runtime.js';

test('mission governance keeps delegated stewardship and human agency above revenue', () => {
  assert.equal(AI_MISSION_POLICY.authorityModel.humanRole, 'steward_delegate');
  assert.equal(AI_MISSION_POLICY.authorityModel.chiefAiRole, 'orchestrator_not_sovereign');
  assert.equal(AI_MISSION_POLICY.policyPriority[0], 'mission_and_human_dignity');
  assert.equal(AI_MISSION_POLICY.policyPriority.at(-1), 'efficiency_and_revenue');
  assert.equal(AI_MISSION_RUNTIME.version, AI_MISSION_POLICY.version);
  for (const principle of ['stewardship', 'agency', 'koinonia', 'diaspora', 'jubilee', 'holiness']) {
    assert.ok(AI_MISSION_POLICY.principles[principle]);
  }
});

test('unknown agents receive no implicit execution authority', () => {
  const result = evaluateAgentAction({ agentId: 'unregistered-agent', area: 'routine_task', reversible: true, delegated: true, logged: true, preflightVerified: true });
  assert.equal(result.tier, 'human_gate');
  assert.equal(canChiefOverride(result), false);
});

test('forbidden actions cannot be overridden by Chief AI', () => {
  const result = evaluateAgentAction({ agentId: 'marketing', area: 'deliberate_creation_of_dependency_to_increase_revenue' });
  assert.equal(result.tier, 'forbidden');
  assert.equal(canChiefOverride(result), false);
});

test('pastoral judgment stays behind a human steward gate', () => {
  const result = evaluateAgentAction({ agentId: 'ministry', area: 'spiritual_or_pastoral_judgment_about_a_person' });
  assert.equal(result.tier, 'human_gate');
  assert.equal(canChiefOverride(result), false);
});

test('authorized read-only observation can run automatically', () => {
  const result = evaluateAgentAction({ agentId: 'platform', area: 'health_checks' });
  assert.equal(result.tier, 'observe');
  assert.equal(result.policyVersion, AI_MISSION_POLICY.version);
});

test('guarded reversible work can execute only after complete preflight controls', () => {
  const permitted = evaluateAgentAction({
    agentId: 'release',
    area: 'safe_staging_configuration',
    reversible: true,
    delegated: true,
    logged: true,
    preflightVerified: true,
  });
  assert.equal(permitted.tier, 'execute_reversible');
  assert.match(permitted.explanation, /result must still be verified/i);

  const incomplete = evaluateAgentAction({
    agentId: 'release',
    area: 'safe_staging_configuration',
    reversible: true,
    delegated: true,
    logged: true,
    preflightVerified: false,
  });
  assert.equal(incomplete.tier, 'assist');
});

test('rights reductions and cross-tenant private data requests always escalate', () => {
  assert.equal(evaluateAgentAction({ agentId: 'platform', area: 'settings', reducesUserRights: true }).tier, 'human_gate');
  assert.equal(evaluateAgentAction({ agentId: 'community', area: 'analysis', crossTenantPrivateData: true }).tier, 'human_gate');
});
