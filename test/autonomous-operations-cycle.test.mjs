import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutonomousOperationsPlan, renderAutonomousOperationsSummary } from '../scripts/run-autonomous-operations-cycle.mjs';

const now = new Date('2026-09-15T09:00:00.000Z');
const parallelPolicy = {
  policyId: 'EKODI-AUTONOMY-001',
  parallelExecutionFabric: {
    fabricId: 'EKODI-PARALLEL-EXECUTION-FABRIC-001',
    generation: 10,
    orchestrator: 'ekodi-orchestrator',
    strategy: 'parallel-fan-out-independent-verify-converge',
    minimumReadyLanes: 2,
    preferredLanes: 4,
    methods: [
      { id: 'github-actions-ephemeral', class: 'cloud-ci', availability: 'ready', roles: ['reproduce', 'test'], mutationBoundary: 'ephemeral-workspace-only' },
      { id: 'isolated-container-sandbox', class: 'container-sandbox', availability: 'ready', roles: ['reproduce', 'failure-injection'], mutationBoundary: 'isolated-sandbox-only' },
      { id: 'browser-e2e-executor', class: 'browser-e2e', availability: 'conditional', roles: ['ui-reproduction'], requires: ['browser-capability-available'], mutationBoundary: 'test-session-only' },
      { id: 'external-ai-tool-worker', class: 'external-ai-tool', availability: 'conditional', roles: ['independent-analysis'], requires: ['approved-provider'], mutationBoundary: 'proposal-or-isolated-branch-only' },
    ],
    selection: { diversifyMethodClasses: true },
    convergence: {
      minimumIndependentEvidenceSources: 2,
      requireIndependentVerification: true,
      disagreementPolicy: 'hold-convergence-and-collect-more-evidence',
      failedLanePolicy: 'continue-other-lanes-when-safe-and-record-degraded-capacity',
      productionPromotion: 'central-release-gate-only',
    },
  },
};

function run(overrides = {}) {
  return {
    databaseId: 101,
    workflowName: 'EKODI site monitor',
    workflowPath: '.github/workflows/monitor.yml',
    status: 'completed', conclusion: 'failure',
    createdAt: '2026-09-15T08:30:00.000Z',
    event: 'schedule', runAttempt: 1,
    url: 'https://github.com/example/repo/actions/runs/101',
    ...overrides,
  };
}

test('plans one bounded retry for a delegated scheduled read-only workflow failure', () => {
  const plan = buildAutonomousOperationsPlan([run()], parallelPolicy, now);
  assert.equal(plan.triggerOwner, 'ekodi-internal-scheduler');
  assert.equal(plan.chatgptTriggerRequired, false);
  assert.deepEqual(plan.cycle, ['observe','detect','reason','plan','execute','verify','recover','learn']);
  assert.equal(plan.safeRetries.length, 1);
  assert.equal(plan.safeRetries[0].runId, 101);
  assert.equal(plan.authority.expanded, false);
  assert.equal(plan.authority.directProductionMutation, false);
  assert.equal(plan.authority.automaticPromotion, false);
  assert.equal(plan.parallelExecution.orchestrator, 'ekodi-orchestrator');
});

test('does not retry deployment, PR, manual, second-attempt, or already recovered work', () => {
  const samples = [
    run({ databaseId: 201, workflowName: 'Deploy EKODI Shared Site Core', workflowPath: '.github/workflows/deploy-shared-site-core.yml' }),
    run({ databaseId: 202, event: 'pull_request' }),
    run({ databaseId: 203, event: 'workflow_dispatch' }),
    run({ databaseId: 204, runAttempt: 2 }),
    run({ databaseId: 205, conclusion: 'success' }),
    run({ databaseId: 206, createdAt: '2026-09-15T08:10:00.000Z' }),
    run({ databaseId: 207, conclusion: 'success', createdAt: '2026-09-15T08:20:00.000Z' }),
  ];
  const plan = buildAutonomousOperationsPlan(samples, parallelPolicy, now);
  assert.equal(plan.safeRetries.length, 0);
  assert.equal(plan.learning.staleFailureRetrySuppressedAfterVerifiedRecovery, true);
});

test('learns verified bounded recovery outcomes', () => {
  const runs = [
    run({ databaseId: 301, createdAt: '2026-09-15T08:00:00.000Z' }),
    run({ databaseId: 302, createdAt: '2026-09-15T08:20:00.000Z', conclusion: 'success', runAttempt: 2 }),
  ];
  const plan = buildAutonomousOperationsPlan(runs, parallelPolicy, now);
  assert.equal(plan.safeRetries.length, 0);
  assert.equal(plan.learning.recovery.boundedRecoveryAttempts24h, 1);
  assert.equal(plan.learning.recovery.boundedRecoverySuccesses24h, 1);
  assert.equal(plan.learning.recovery.boundedRecoveryEffectiveness, 1);
  assert.equal(plan.learning.recovery.recoveredPatterns.length, 1);
});

test('persistent failures create orchestrator-led parallel engineering attention and clear after verified recovery', () => {
  const failed = [
    run({ databaseId: 401, createdAt: '2026-09-15T08:40:00.000Z', runAttempt: 2 }),
    run({ databaseId: 402, createdAt: '2026-09-15T08:20:00.000Z', runAttempt: 2 }),
    run({ databaseId: 403, createdAt: '2026-09-15T08:00:00.000Z', runAttempt: 2 }),
  ];
  const plan = buildAutonomousOperationsPlan(failed, parallelPolicy, now);
  assert.equal(plan.attention.length, 1);
  assert.equal(plan.attention[0].failureCount24h, 3);
  assert.equal(plan.attention[0].ownerDecisionRequired, false);
  assert.equal(plan.attention[0].isolatedEngineeringHandoffRequired, true);
  assert.equal(plan.attention[0].parallelExecutionRequired, true);
  assert.equal(plan.attention[0].executionCoordinationOwner, 'ekodi-orchestrator');

  assert.equal(plan.parallelExecution.enabled, true);
  assert.equal(plan.parallelExecution.virtualizationOnly, false);
  assert.equal(plan.parallelExecution.readyMethodCount, 2);
  assert.equal(plan.parallelExecution.conditionalMethodCount, 2);
  assert.equal(plan.parallelExecution.assignments.length, 1);
  const assignment = plan.parallelExecution.assignments[0];
  assert.equal(assignment.executionState, 'parallel-ready');
  assert.equal(assignment.readyLanes, 2);
  assert.equal(assignment.conditionalLanes, 2);
  assert.equal(assignment.virtualizationOnly, false);
  assert.deepEqual(assignment.lanes.map(lane => lane.methodClass), ['cloud-ci', 'container-sandbox', 'browser-e2e', 'external-ai-tool']);
  assert.ok(assignment.lanes.every(lane => lane.directProductionMutation === false));
  assert.ok(assignment.lanes.every(lane => lane.maySelfPromote === false));
  assert.equal(assignment.convergence.minimumIndependentEvidenceSources, 2);
  assert.equal(assignment.convergence.productionPromotion, 'central-release-gate-only');

  const recovered = buildAutonomousOperationsPlan([
    ...failed,
    run({ databaseId: 404, createdAt: '2026-09-15T08:50:00.000Z', conclusion: 'success', runAttempt: 2 }),
  ], parallelPolicy, now);
  assert.equal(recovered.attention.length, 0);
  assert.equal(recovered.parallelExecution.assignments.length, 0);
  assert.equal(recovered.learning.persistentAttentionClearsAfterVerifiedRecovery, true);
});

test('parallel fabric reports degraded readiness without handing authority to a single executor', () => {
  const degradedPolicy = structuredClone(parallelPolicy);
  degradedPolicy.parallelExecutionFabric.methods[1].availability = 'conditional';
  const failed = [
    run({ databaseId: 501, createdAt: '2026-09-15T08:40:00.000Z', runAttempt: 2 }),
    run({ databaseId: 502, createdAt: '2026-09-15T08:20:00.000Z', runAttempt: 2 }),
    run({ databaseId: 503, createdAt: '2026-09-15T08:00:00.000Z', runAttempt: 2 }),
  ];
  const plan = buildAutonomousOperationsPlan(failed, degradedPolicy, now);
  const assignment = plan.parallelExecution.assignments[0];
  assert.equal(assignment.executionState, 'degraded-insufficient-ready-lanes');
  assert.equal(assignment.readyLanes, 1);
  assert.equal(plan.parallelExecution.authority.executorMayExpandAuthority, false);
  assert.equal(plan.parallelExecution.authority.executorMayMutateProductionDirectly, false);
  assert.equal(plan.parallelExecution.authority.executorMaySelfPromote, false);
  assert.equal(plan.parallelExecution.authority.centralReleaseGateRequired, true);
});

test('integrates Generation 10 evolution learning without autonomous promotion', () => {
  const evolution = { currentGeneration: 10, summary: { total: 5, researchVerified: 4, operationalResolutionsVerified: 2, experimentsReady: 2, experimentsPassed: 1, candidatesReady: 1, postChangeVerified: 1, rollbackRequired: 0, learningClosed: 3 } };
  const plan = buildAutonomousOperationsPlan([run({ conclusion: 'success' })], parallelPolicy, now, evolution);
  assert.equal(plan.learning.evolution.currentGeneration, 10);
  assert.equal(plan.learning.evolution.lifecycleRecords, 5);
  assert.equal(plan.learning.evolution.learningLoopsClosed, 3);
  assert.equal(plan.learning.evolution.candidatesReadyForSuperAdminReview, 1);
  assert.equal(plan.learning.evolution.automaticPromotionPerformed, false);
});

test('summary stays concise when no action is required and reports the fabric owner', () => {
  const plan = buildAutonomousOperationsPlan([run({ conclusion: 'success' })], parallelPolicy, now);
  const summary = renderAutonomousOperationsSummary(plan);
  assert.match(summary, /ChatGPT trigger required: \*\*NO\*\*/);
  assert.match(summary, /Parallel execution fabric: \*\*ENABLED\*\*/);
  assert.match(summary, /Execution coordination owner: \*\*ekodi-orchestrator\*\*/);
  assert.match(summary, /Virtualization-only architecture: \*\*NO\*\*/);
  assert.match(summary, /No delegated recovery action/);
  assert.match(summary, /Automatic promotion: \*\*NO\*\*/);
});
