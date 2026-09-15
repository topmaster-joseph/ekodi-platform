import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutonomousOperationsPlan,
  renderAutonomousOperationsSummary,
} from '../scripts/run-autonomous-operations-cycle.mjs';

const now = new Date('2026-09-15T09:00:00.000Z');

function run(overrides = {}) {
  return {
    databaseId: 101,
    workflowName: 'EKODI site monitor',
    workflowPath: '.github/workflows/monitor.yml',
    status: 'completed',
    conclusion: 'failure',
    createdAt: '2026-09-15T08:30:00.000Z',
    event: 'schedule',
    runAttempt: 1,
    url: 'https://github.com/example/repo/actions/runs/101',
    ...overrides,
  };
}

test('plans one bounded retry for a delegated scheduled read-only workflow failure', () => {
  const plan = buildAutonomousOperationsPlan([run()], { policyId: 'EKODI-AUTONOMY-001' }, now);
  assert.equal(plan.triggerOwner, 'ekodi-internal-scheduler');
  assert.equal(plan.chatgptTriggerRequired, false);
  assert.equal(plan.safeRetries.length, 1);
  assert.equal(plan.safeRetries[0].runId, 101);
  assert.equal(plan.safeRetries[0].action, 'rerun-failed-jobs-once');
  assert.equal(plan.authority.expanded, false);
  assert.equal(plan.authority.directProductionMutation, false);
});

test('does not retry deployment, production, PR, manual, or second-attempt work', () => {
  const samples = [
    run({ databaseId: 201, workflowName: 'Deploy EKODI Shared Site Core', workflowPath: '.github/workflows/deploy-shared-site-core.yml' }),
    run({ databaseId: 202, event: 'pull_request' }),
    run({ databaseId: 203, event: 'workflow_dispatch' }),
    run({ databaseId: 204, runAttempt: 2 }),
    run({ databaseId: 205, conclusion: 'success' }),
  ];
  const plan = buildAutonomousOperationsPlan(samples, {}, now);
  assert.equal(plan.safeRetries.length, 0);
});

test('surfaces persistent failures without claiming owner approval or authority expansion', () => {
  const runs = [
    run({ databaseId: 301, createdAt: '2026-09-15T08:40:00.000Z' }),
    run({ databaseId: 302, createdAt: '2026-09-15T08:20:00.000Z', runAttempt: 2 }),
    run({ databaseId: 303, createdAt: '2026-09-15T08:00:00.000Z', runAttempt: 2 }),
  ];
  const plan = buildAutonomousOperationsPlan(runs, {}, now);
  assert.equal(plan.attention.length, 1);
  assert.equal(plan.attention[0].failureCount24h, 3);
  assert.equal(plan.attention[0].ownerDecisionRequired, false);
  assert.equal(plan.attention[0].autonomousEngineeringWorkerRequired, true);
  assert.equal(plan.authority.ownerGatesPreserved, true);
});

test('summary stays concise when no action is required', () => {
  const plan = buildAutonomousOperationsPlan([run({ conclusion: 'success' })], {}, now);
  const summary = renderAutonomousOperationsSummary(plan);
  assert.match(summary, /ChatGPT trigger required: \*\*NO\*\*/);
  assert.match(summary, /No delegated recovery action/);
});
