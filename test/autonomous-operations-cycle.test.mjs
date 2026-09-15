import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutonomousOperationsPlan, renderAutonomousOperationsSummary } from '../scripts/run-autonomous-operations-cycle.mjs';

const now = new Date('2026-09-15T09:00:00.000Z');
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
  const plan = buildAutonomousOperationsPlan([run()], { policyId: 'EKODI-AUTONOMY-001' }, now);
  assert.equal(plan.triggerOwner, 'ekodi-internal-scheduler');
  assert.equal(plan.chatgptTriggerRequired, false);
  assert.deepEqual(plan.cycle, ['observe','detect','reason','plan','execute','verify','recover','learn']);
  assert.equal(plan.safeRetries.length, 1);
  assert.equal(plan.safeRetries[0].runId, 101);
  assert.equal(plan.authority.expanded, false);
  assert.equal(plan.authority.directProductionMutation, false);
  assert.equal(plan.authority.automaticPromotion, false);
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
  const plan = buildAutonomousOperationsPlan(samples, {}, now);
  assert.equal(plan.safeRetries.length, 0);
  assert.equal(plan.learning.staleFailureRetrySuppressedAfterVerifiedRecovery, true);
});

test('learns verified bounded recovery outcomes', () => {
  const runs = [
    run({ databaseId: 301, createdAt: '2026-09-15T08:00:00.000Z' }),
    run({ databaseId: 302, createdAt: '2026-09-15T08:20:00.000Z', conclusion: 'success', runAttempt: 2 }),
  ];
  const plan = buildAutonomousOperationsPlan(runs, {}, now);
  assert.equal(plan.safeRetries.length, 0);
  assert.equal(plan.learning.recovery.boundedRecoveryAttempts24h, 1);
  assert.equal(plan.learning.recovery.boundedRecoverySuccesses24h, 1);
  assert.equal(plan.learning.recovery.boundedRecoveryEffectiveness, 1);
  assert.equal(plan.learning.recovery.recoveredPatterns.length, 1);
});

test('persistent failures create isolated engineering attention but clear after verified recovery', () => {
  const failed = [
    run({ databaseId: 401, createdAt: '2026-09-15T08:40:00.000Z', runAttempt: 2 }),
    run({ databaseId: 402, createdAt: '2026-09-15T08:20:00.000Z', runAttempt: 2 }),
    run({ databaseId: 403, createdAt: '2026-09-15T08:00:00.000Z', runAttempt: 2 }),
  ];
  const plan = buildAutonomousOperationsPlan(failed, {}, now);
  assert.equal(plan.attention.length, 1);
  assert.equal(plan.attention[0].failureCount24h, 3);
  assert.equal(plan.attention[0].ownerDecisionRequired, false);
  assert.equal(plan.attention[0].isolatedEngineeringHandoffRequired, true);

  const recovered = buildAutonomousOperationsPlan([
    ...failed,
    run({ databaseId: 404, createdAt: '2026-09-15T08:50:00.000Z', conclusion: 'success', runAttempt: 2 }),
  ], {}, now);
  assert.equal(recovered.attention.length, 0);
  assert.equal(recovered.learning.persistentAttentionClearsAfterVerifiedRecovery, true);
});

test('integrates Generation 10 evolution learning without autonomous promotion', () => {
  const evolution = { currentGeneration: 10, summary: { total: 5, researchVerified: 4, operationalResolutionsVerified: 2, experimentsReady: 2, experimentsPassed: 1, candidatesReady: 1, postChangeVerified: 1, rollbackRequired: 0, learningClosed: 3 } };
  const plan = buildAutonomousOperationsPlan([run({ conclusion: 'success' })], {}, now, evolution);
  assert.equal(plan.learning.evolution.currentGeneration, 10);
  assert.equal(plan.learning.evolution.lifecycleRecords, 5);
  assert.equal(plan.learning.evolution.learningLoopsClosed, 3);
  assert.equal(plan.learning.evolution.candidatesReadyForSuperAdminReview, 1);
  assert.equal(plan.learning.evolution.automaticPromotionPerformed, false);
});

test('summary stays concise when no action is required', () => {
  const plan = buildAutonomousOperationsPlan([run({ conclusion: 'success' })], {}, now);
  const summary = renderAutonomousOperationsSummary(plan);
  assert.match(summary, /ChatGPT trigger required: \*\*NO\*\*/);
  assert.match(summary, /No delegated recovery action/);
  assert.match(summary, /Automatic promotion: \*\*NO\*\*/);
});
