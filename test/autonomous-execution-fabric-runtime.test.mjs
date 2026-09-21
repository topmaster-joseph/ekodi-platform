import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutonomousExecutionFabricStatus,
  runAutonomousExecutionTask,
  runAutonomousParallelExecutionTask,
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
  evidence: { isolation: 'verified', test: 'passed', resultDigest: 'sha256:parallel-proof' },
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

test('runtime advertises orchestrator-led multi-method Gen10 fabric without claiming production readiness', () => {
  const status = getAutonomousExecutionFabricStatus();
  assert.equal(status.generation, 10);
  assert.equal(status.policyId, 'EXEC-FABRIC-001');
  assert.equal(status.orchestrator, 'ekodi-orchestrator');
  assert.equal(status.mode, 'orchestrator_parallel_multi_method_execution');
  assert.equal(status.defaultIsolationProfile, 's0-default');
  assert.equal(status.mutatingWorkRequiresFabric, true);
  assert.equal(status.providerIndependent, true);
  assert.equal(status.virtualizationOnly, false);
  assert.equal(status.virtualizedIsolationLaneRequiredForMutatingEngineeringWork, true);
  assert.equal(status.minimumIndependentLanes, 2);
  assert.equal(status.minimumIndependentMethodClasses, 2);
  assert.equal(status.directHostMutationForbidden, true);
  assert.equal(status.directProductionMutationForbidden, true);
  assert.equal(status.executorSelfPromotionForbidden, true);
  assert.equal(status.nonProductionRuntimeProven, true);
  assert.equal(status.runtimeProductionReadinessClaimed, false);
});

test('delegated green work remains compatible with single-provider bounded execution', async () => {
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
  assert.equal(typeof seenEnvelope.taskGrantToken, 'string');
  assert.ok(seenEnvelope.taskGrantToken.length >= 32);
  assert.equal(seenEnvelope.taskGrant.productionMutationAllowed, false);
  assert.equal(seenEnvelope.taskGrant.providerMutationAllowed, false);
  assert.equal(result.receipt.taskGrant.revoked, true);
  assert.equal(result.receipt.taskGrant.rawTokenPersisted, false);
  assert.equal(seenEnvelope.isolationProfile, 's0-default');
  assert.equal(seenEnvelope.taskId, 'gen10-runtime-test');
  assert.equal(result.receipt.workspaceIsolation, true);
});

test('parallel execution fans one task to distinct methods and converges matching evidence', async () => {
  const seen = [];
  const result = await runAutonomousParallelExecutionTask(baseTask({
    providers: [
      {
        id: 'native-runner',
        kind: 'connected_plugin',
        methodClass: 'cloud-ci-native',
        state: 'connected',
        invoke: async envelope => {
          seen.push(['native', envelope]);
          return receipt({ executionId: 'exec-native' });
        },
      },
      {
        id: 'rootless-container',
        kind: 'official_api',
        methodClass: 'container-sandbox',
        state: 'connected',
        invoke: async envelope => {
          seen.push(['container', envelope]);
          return receipt({ executionId: 'exec-container' });
        },
      },
    ],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.executed, true);
  assert.equal(result.converged, true);
  assert.equal(result.orchestrator, 'ekodi-orchestrator');
  assert.equal(result.successfulLanes, 2);
  assert.equal(result.successfulMethodClasses, 2);
  assert.equal(result.consensusDigest, 'sha256:parallel-proof');
  assert.deepEqual(result.laneResults.map(lane => lane.methodClass).sort(), ['cloud-ci-native', 'container-sandbox']);
  assert.ok(result.laneResults.every(lane => lane.productionMutationPerformed === false));
  assert.ok(result.laneResults.every(lane => lane.authorityExpanded === false));
  assert.equal(result.productionPromotionAuthorized, false);
  assert.equal(seen.length, 2);
  assert.ok(seen.every(([, envelope]) => envelope.productionAllowed === false));
});

test('parallel convergence holds when independent methods disagree', async () => {
  const result = await runAutonomousParallelExecutionTask(baseTask({
    providers: [
      {
        id: 'method-a', kind: 'connected_plugin', methodClass: 'cloud-ci-native', state: 'connected',
        invoke: async () => receipt({ evidence: { resultDigest: 'sha256:a' } }),
      },
      {
        id: 'method-b', kind: 'official_api', methodClass: 'container-sandbox', state: 'connected',
        invoke: async () => receipt({ evidence: { resultDigest: 'sha256:b' } }),
      },
    ],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.executed, true);
  assert.equal(result.converged, false);
  assert.equal(result.reason, 'independent_evidence_disagreement');
  assert.equal(result.nextStage, 'collect_more_evidence');
  assert.equal(result.productionPromotionAuthorized, false);
});

test('parallel convergence refuses to hand control to one surviving method', async () => {
  const result = await runAutonomousParallelExecutionTask(baseTask({
    providers: [
      {
        id: 'unsafe-method', kind: 'official_api', methodClass: 'external-ai-tool', state: 'connected',
        invoke: async () => receipt({ productionMutationPerformed: true }),
      },
      {
        id: 'safe-method', kind: 'connected_plugin', methodClass: 'container-sandbox', state: 'connected',
        invoke: async () => receipt({ executionId: 'safe' }),
      },
    ],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.converged, false);
  assert.equal(result.successfulLanes, 1);
  assert.equal(result.reason, 'insufficient_independent_execution_lanes');
  assert.equal(result.productionPromotionAuthorized, false);
});

test('explicit isolation profile is pinned into the provider execution envelope', async () => {
  let seenEnvelope;
  const result = await runAutonomousExecutionTask(baseTask({
    isolationProfile: 'strong-vm',
    providers: [{
      id: 'strong-provider',
      kind: 'connected_plugin',
      state: 'connected',
      invoke: async envelope => {
        seenEnvelope = envelope;
        return receipt();
      },
    }],
  }));

  assert.equal(result.ok, true);
  assert.equal(seenEnvelope.isolationProfile, 'strong-vm');
});

test('red-class work is human gated and providers are never invoked, including parallel path', async () => {
  let invoked = 0;
  const providers = [
    { id: 'should-not-run-a', kind: 'connected_plugin', methodClass: 'cloud-ci-native', state: 'connected', invoke: async () => { invoked += 1; return receipt(); } },
    { id: 'should-not-run-b', kind: 'official_api', methodClass: 'container-sandbox', state: 'connected', invoke: async () => { invoked += 1; return receipt(); } },
  ];
  const single = await runAutonomousExecutionTask(baseTask({ area: 'secrets', providers }));
  const parallel = await runAutonomousParallelExecutionTask(baseTask({ area: 'secrets', providers }));

  assert.equal(invoked, 0);
  assert.equal(single.ok, false);
  assert.equal(single.requiresHumanGate, true);
  assert.equal(parallel.ok, false);
  assert.equal(parallel.requiresHumanGate, true);
  assert.equal(parallel.productionPromotionAuthorized, false);
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

test('invalid provider receipt is rejected and failover continues in compatibility path', async () => {
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
  await assert.rejects(
    runAutonomousParallelExecutionTask(baseTask({ branch: 'feature/not-governed' })),
    /ai\/<agent>\/<task-id>/,
  );
});
