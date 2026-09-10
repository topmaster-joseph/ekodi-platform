import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOVEREIGN_AUTONOMY_POLICY,
  classifyAutonomousArea,
  evaluateAutonomousOperation,
  nextAutonomyStage,
  getSovereignAutonomySummary,
} from '../sovereign-autonomy-runtime.js';

test('v1.8 hierarchy preserves sovereign authority above autonomy, agents and services', () => {
  assert.deepEqual(getSovereignAutonomySummary().hierarchy, ['sovereign','autonomous','agentic','services']);
  assert.equal(SOVEREIGN_AUTONOMY_POLICY.authorityContext, 'Person + Workspace + Role + Capability');
});

test('green work can execute only when delegated, reversible, audited and preflight verified', () => {
  const base = { area: 'ui', personId: 'person-1', workspaceId: 'ws-1', role: 'owner', capability: 'ui.edit' };
  assert.equal(evaluateAutonomousOperation(base).tier, 'assist');
  const allowed = evaluateAutonomousOperation({ ...base, delegated: true, reversible: true, audited: true, preflightVerified: true });
  assert.equal(allowed.tier, 'execute_reversible');
  assert.equal(allowed.nextStage, 'verify');
});

test('yellow work requires an explicit contract, rollback and verification definition', () => {
  const base = { area: 'service_contract', personId: 'person-1', workspaceId: 'ws-1', role: 'owner', capability: 'service.contract', delegated: true, reversible: true, audited: true, preflightVerified: true };
  assert.equal(classifyAutonomousArea(base.area), 'yellow');
  assert.equal(evaluateAutonomousOperation(base).tier, 'assist');
  const allowed = evaluateAutonomousOperation({ ...base, contractDeclared: true, rollbackDefined: true, verificationDefined: true });
  assert.equal(allowed.tier, 'execute_bounded_contract');
});

test('red sovereign-core work always requires a human gate', () => {
  const result = evaluateAutonomousOperation({ area: 'auth', personId: 'person-1', workspaceId: 'ws-1', role: 'owner', capability: 'auth.change', delegated: true, reversible: true, audited: true, preflightVerified: true });
  assert.equal(result.tier, 'human_gate');
  assert.equal(result.executionClass, 'red');
});

test('unknown work fails into contract-sensitive yellow instead of implicit green authority', () => {
  assert.equal(classifyAutonomousArea('future_unknown_operation'), 'yellow');
});

test('autonomous execution requires Person + Workspace + Role + Capability context', () => {
  const result = evaluateAutonomousOperation({ area: 'content', delegated: true, reversible: true, audited: true, preflightVerified: true });
  assert.equal(result.tier, 'assist');
  assert.match(result.reason, /^authority_context_missing:/);
});

test('production work routes to the independent control plane instead of direct agent mutation', () => {
  const result = evaluateAutonomousOperation({ area: 'content', personId: 'person-1', workspaceId: 'ws-1', role: 'owner', capability: 'content.publish', delegated: true, reversible: true, audited: true, preflightVerified: true, production: true });
  assert.equal(result.tier, 'control_plane_required');
  assert.equal(result.reason, 'production_promotion_only');
});

test('failed verification routes to recovery before learning', () => {
  assert.equal(nextAutonomyStage('execute', 'ok'), 'verify');
  assert.equal(nextAutonomyStage('verify', 'failed'), 'recover');
  assert.equal(nextAutonomyStage('recover', 'ok'), 'learn');
});
