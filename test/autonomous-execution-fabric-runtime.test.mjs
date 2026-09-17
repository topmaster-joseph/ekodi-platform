import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutonomousExecutionFabricStatus,
  runAutonomousExecutionTask,
} from '../autonomous-execution-fabric-runtime.js';

const authority = Object.freeze({
  personId: 'person-test',
  workspaceId: 'workspace-test',
  role: 'operator',
  capability: 'platform_change',
  delegated: true,
  reversible: true,
  audited: true,
  preflightVerified: true,
});

const receipt = overrides => ({
  executionId: 'exec-test',
  ephemeral: true,
  workspaceIsolation: true,
  productionMutationPerformed: false,
  authorityExpanded: false,
  productionSecretExposed: false,
  evidence: { isolation: 'verified', test: 'passed' },
  ...overrides,
});

const baseTask = overrides => ({
  taskId: 'gen10-runtime-test',
  branch: 'ai/chatgpt/gen10-runtime-test',
  baseCommit: '0123456789abcdef0123456789abcdef01234567',
  area: 'documentation',
  goal: 'Prove delegated isolated execution.',
  context: authority,
  ...overrides,
});

test('runtime advertises Gen10 without claiming production readiness', () => {
  const status = getAutonomousExecutionFabricStatus();
  assert.equal(status.generation, 10);
  assert.equal(status.directProductionMutationForbidden, true);
  assert.equal(status.runtimeProductionReadinessClaimed, false);
});

test('delegated green work executes through a compliant ephemeral provider', async () => {
  let seenEnvelope;
  const result = await runAutonomousExecutionTask(baseTask({
    providers: [{
      id: 'github-ephemeral',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async envelope => {
        seenEnvelope = envelope;
        return receipt();
      },
    }],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.executed, true);
  assert.equal(result.provider, 'github-ephemeral');
  assert.equal(result.productionPromotionAuthorized, false);
  assert.equal(result.nextStage, 'verify');
  assert.equal(seenEnvelope.productionAllowed, false);
  assert.equal(seenEnvelope.taskId, 'gen10-runtime-test');
  assert.equal(result.receipt.workspaceIsolation, true);
});

test('red-class work is human gated and provider is never invoked', async () => {
  let invoked = false;
  const result = await runAutonomousExecutionTask(baseTask({
    area: 'secrets',
    providers: [{
      id: 'should-not-run',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async () => { invoked = true; return receipt(); },
    }],
  }));

  assert.equal(invoked, false);
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  assert.equal(result.requiresHumanGate, true);
  assert.equal(result.decision.tier, 'human_gate');
});

test('missing sovereign authority context blocks execution', async () => {
  let invoked = false;
  const result = await runAutonomousExecutionTask(baseTask({
    context: { delegated: true, reversible: true, audited: true, preflightVerified: true },
    providers: [{
      id: 'should-not-run',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async () => { invoked = true; return receipt(); },
    }],
  }));

  assert.equal(invoked, false);
  assert.equal(result.ok, false);
  assert.equal(result.decision.tier, 'assist');
});

test('production context routes to the independent control plane instead of execution', async () => {
  let invoked = false;
  const result = await runAutonomousExecutionTask(baseTask({
    context: { ...authority, production: true },
    providers: [{
      id: 'should-not-run',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async () => { invoked = true; return receipt(); },
    }],
  }));

  assert.equal(invoked, false);
  assert.equal(result.ok, false);
  assert.equal(result.requiresControlPlane, true);
  assert.equal(result.decision.tier, 'control_plane_required');
});

test('invalid provider receipt is rejected and failover continues', async () => {
  const result = await runAutonomousExecutionTask(baseTask({
    providers: [
      {
        id: 'unsafe-provider',
        kind: 'official_api',
        state: 'connected',
        invoke: async () => receipt({ productionMutationPerformed: true }),
      },
      {
        id: 'safe-provider',
        kind: 'connected_plugin',
        state: 'connected',
        invoke: async () => receipt({ executionId: 'exec-safe' }),
      },
    ],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'safe-provider');
  assert.deepEqual(result.attemptedProviders, ['unsafe-provider', 'safe-provider']);
  assert.equal(result.receipt.executionId, 'exec-safe');
});

test('yellow work requires contract and rollback evidence before provider invocation', async () => {
  let invoked = false;
  const blocked = await runAutonomousExecutionTask(baseTask({
    area: 'worker',
    providers: [{
      id: 'worker-provider',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async () => { invoked = true; return receipt(); },
    }],
  }));
  assert.equal(invoked, false);
  assert.equal(blocked.decision.tier, 'assist');

  const allowed = await runAutonomousExecutionTask(baseTask({
    area: 'worker',
    context: {
      ...authority,
      contractDeclared: true,
      rollbackDefined: true,
      verificationDefined: true,
    },
    providers: [{
      id: 'worker-provider',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async () => receipt(),
    }],
  }));
  assert.equal(allowed.ok, true);
  assert.equal(allowed.decision.tier, 'execute_bounded_contract');
});

test('noncompliant source branch is rejected before authority or provider work', async () => {
  await assert.rejects(
    runAutonomousExecutionTask(baseTask({ branch: 'feature/not-governed' })),
    /ai\/<agent>\/<task-id>/,
  );
});
