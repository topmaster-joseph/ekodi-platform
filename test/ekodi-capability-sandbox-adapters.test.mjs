import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SANDBOX_ADAPTER_POLICY,
  buildSandboxAdapterRegistry,
  hasSandboxAdapter,
  sandboxAdapterCapabilityIds,
} from '../ekodi-capability-sandbox-adapters.js';
import { runFunctionalCapabilitySandbox } from '../ekodi-capability-sandbox.js';
import { getCapabilityNode } from '../ekodi-capability-ecosystem.js';

const CAPABILITY_ID = 'community.site-board';

function candidate() {
  return {
    id: 'functional-sandbox-community-site-board',
    goal: 'Create, verify and roll back an isolated community board post.',
    proposalOnly: true,
    productionMutation: false,
    authorityExpansion: false,
    rollbackRequired: true,
    verificationRequired: true,
    steps: [{ type: 'invoke_capability', capabilityId: CAPABILITY_ID }],
  };
}

test('every registered sandbox adapter targets a reversible, executable capability', () => {
  const ids = sandboxAdapterCapabilityIds();
  assert.ok(ids.length >= 1, 'at least one sandbox adapter must be registered');
  for (const id of ids) {
    const node = getCapabilityNode(id);
    assert.ok(node, `${id} must be a registered capability`);
    assert.equal(node.actionTier, 'execute_reversible');
    assert.equal(hasSandboxAdapter(id), true);
  }
});

test('registry hands out isolated adapter instances per build', async () => {
  const first = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  const second = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  assert.notEqual(first, second);

  const context = {
    executionId: 'exec_isolation',
    goal: 'isolation probe',
    target: { workspaceId: 'sandbox_isolation', surface: 'sandbox' },
    authority: { role: 'sandbox-executor' },
  };
  await first.execute(context);
  assert.equal(first.residualRecordCount(), 1);
  assert.equal(second.residualRecordCount(), 0, 'a second registry must not see the first registry state');
});

test('site-board adapter passes the functional sandbox and leaves no residue', async () => {
  const adapter = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  const result = await runFunctionalCapabilitySandbox(candidate(), { adapter, trials: 4 });

  assert.equal(result.evaluation.verified, true, result.reason || 'adapter must pass the functional sandbox');
  assert.equal(result.promotion, 'architecture_benchmark_required');
  assert.equal(result.evidence.testCount, 4);
  assert.equal(result.evidence.passed, 4);
  assert.equal(result.evidence.rollbackPassed, 4);
  assert.equal(result.evidence.isolatedEffects, 4);
  assert.equal(result.evidence.criticalRegressions, 0);
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.authorityExpansionPerformed, false);
  assert.equal(adapter.residualRecordCount(), 0, 'rollback must leave the isolated store empty');
});

test('adapter refuses a non-sandbox surface instead of trusting the caller', async () => {
  const adapter = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  const production = {
    executionId: 'exec_production',
    goal: 'production attempt',
    target: { workspaceId: 'ekodi-production', surface: 'production' },
    authority: { role: 'super-admin' },
  };

  const preflight = await adapter.preflight(production);
  assert.equal(preflight.ok, false);
  assert.equal(preflight.reason, 'sandbox_surface_required');

  await assert.rejects(() => adapter.execute(production));
  assert.equal(adapter.residualRecordCount(), 0, 'a refused execution must write nothing');
});

test('adapter refuses a sandbox surface outside the sandbox workspace prefix', async () => {
  const adapter = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  const preflight = await adapter.preflight({
    executionId: 'exec_prefix',
    target: { workspaceId: 'live_church', surface: 'sandbox' },
    authority: { role: 'sandbox-executor' },
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.reason, 'sandbox_workspace_prefix_required');
});

test('adapter refuses a caller that is not acting as the sandbox executor', async () => {
  const adapter = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  const preflight = await adapter.preflight({
    executionId: 'exec_role',
    target: { workspaceId: 'sandbox_role_probe', surface: 'sandbox' },
    authority: { role: 'super-admin' },
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.reason, 'sandbox_executor_role_required');
});

test('verification fails when the isolated effect is absent', async () => {
  const adapter = buildSandboxAdapterRegistry()[CAPABILITY_ID];
  const verification = await adapter.verify({
    executionId: 'exec_never_ran',
    target: { workspaceId: 'sandbox_missing', surface: 'sandbox' },
    authority: { role: 'sandbox-executor' },
  });
  assert.equal(verification.passed, false);
  assert.equal(verification.reason, 'sandbox_record_not_found');
});

test('sandbox adapter policy forbids production mutation and authority expansion', () => {
  assert.equal(SANDBOX_ADAPTER_POLICY.productionMutation, false);
  assert.equal(SANDBOX_ADAPTER_POLICY.authorityExpansion, false);
  assert.equal(SANDBOX_ADAPTER_POLICY.externalNetworkCalls, false);
  assert.equal(SANDBOX_ADAPTER_POLICY.targetGeneration, 10);
});
