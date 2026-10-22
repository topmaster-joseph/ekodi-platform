import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CONVERGE_MAX_RUNS_PER_HEAD,
  CONVERGE_RUN_BUDGET_MS,
  CONVERGE_STUCK_MS,
  isStuckCheckRun,
  mayHandOff,
  stuckRequiredChecks,
  workflowsToRedispatch,
} from '../scripts/lib/converge-stuck-check.mjs';

const REQUIRED = ['test', 'EKODI AI Orchestration Gate'];
const NOW = Date.parse('2026-10-22T15:15:00Z');
const gha = { slug: 'github-actions' };

test('#5625 replay: an orphaned in-progress test job whose run completed is stuck and re-dispatches ci.yml', () => {
  const runs = [
    { name: 'test', status: 'in_progress', conclusion: null, started_at: '2026-10-22T14:23:24Z', app: gha, check_suite: { id: 1 } },
    { name: 'EKODI AI Orchestration Gate', status: 'completed', conclusion: 'success', started_at: '2026-10-22T14:23:24Z', app: gha, check_suite: { id: 2 } },
  ];
  const suites = new Map([[1, { status: 'completed', conclusion: 'success' }]]);
  const stuck = stuckRequiredChecks(REQUIRED, runs, suites, NOW);
  assert.deepEqual(stuck, ['test']);
  assert.deepEqual(workflowsToRedispatch(stuck), ['ci.yml']);
});

test('an orphaned job is stuck immediately, even before the age threshold', () => {
  const run = { name: 'test', status: 'in_progress', started_at: new Date(NOW - 60_000).toISOString() };
  assert.equal(isStuckCheckRun(run, { status: 'completed' }, NOW), true);
});

test('a healthy in-flight required check is never re-run', () => {
  const runs = [{ name: 'test', status: 'in_progress', started_at: new Date(NOW - 3 * 60_000).toISOString(), app: gha, check_suite: { id: 7 } }];
  assert.deepEqual(stuckRequiredChecks(REQUIRED, runs, new Map([[7, { status: 'in_progress' }]]), NOW), []);
});

test('an in-flight run older than the threshold is stuck even if its run looks open', () => {
  const runs = [{ name: 'test', status: 'queued', started_at: new Date(NOW - CONVERGE_STUCK_MS - 1).toISOString(), app: gha, check_suite: { id: 8 } }];
  assert.deepEqual(stuckRequiredChecks(REQUIRED, runs, new Map([[8, { status: 'in_progress' }]]), NOW), ['test']);
});

test('a successful completion anywhere on the head means nothing to heal', () => {
  const runs = [
    { name: 'test', status: 'in_progress', started_at: '2026-10-22T14:23:24Z', app: gha, check_suite: { id: 1 } },
    { name: 'test', status: 'completed', conclusion: 'success', started_at: '2026-10-22T15:00:00Z', app: gha, check_suite: { id: 3 } },
  ];
  assert.deepEqual(stuckRequiredChecks(REQUIRED, runs, new Map([[1, { status: 'completed' }]]), NOW), []);
});

test('a newer healthy run alongside a stuck one is left to finish', () => {
  const runs = [
    { name: 'test', status: 'in_progress', started_at: '2026-10-22T14:23:24Z', app: gha, check_suite: { id: 1 } },
    { name: 'test', status: 'in_progress', started_at: new Date(NOW - 60_000).toISOString(), app: gha, check_suite: { id: 4 } },
  ];
  const suites = new Map([[1, { status: 'completed' }], [4, { status: 'in_progress' }]]);
  assert.deepEqual(stuckRequiredChecks(REQUIRED, runs, suites, NOW), []);
});

test('non-Actions check runs and missing checks are ignored, failures are not treated as stuck', () => {
  const runs = [
    { name: 'test', status: 'in_progress', started_at: '2026-10-22T13:00:00Z', app: { slug: 'other-app' }, check_suite: { id: 9 } },
    { name: 'EKODI AI Orchestration Gate', status: 'completed', conclusion: 'failure', app: gha, check_suite: { id: 10 } },
  ];
  assert.deepEqual(stuckRequiredChecks(REQUIRED, runs, new Map(), NOW), []);
});

test('hand-off is bounded per head', () => {
  assert.equal(mayHandOff(0), true);
  assert.equal(mayHandOff(CONVERGE_MAX_RUNS_PER_HEAD - 1), true);
  assert.equal(mayHandOff(CONVERGE_MAX_RUNS_PER_HEAD), false);
});

test('convergence uses the helpers, heals at most once per run and hands off before the workflow timeout', async () => {
  const script = await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/converge-orchestrated-pr-merge.yml', import.meta.url), 'utf8');
  assert.match(script, /from '\.\/lib\/converge-stuck-check\.mjs'/);
  assert.match(script, /if\(stuckHealDone\)return false;/);
  assert.equal((script.match(/if\(await healStuckRequiredChecks\(headSha\)\)await handOffConvergence\('stuck-required-check'\);/g) || []).length, 2);
  assert.match(script, /if\(Date\.now\(\)-CONVERGE_STARTED>CONVERGE_RUN_BUDGET_MS\)await handOffConvergence\('run-budget'\);/);
  assert.match(script, /await handOffConvergence\('cycle-limit'\);\s*$/);
  assert.doesNotMatch(script, /fail\('merge convergence timeout'\)/);
  // The hand-off budget must leave room inside the job timeout.
  const timeoutMinutes = Number(workflow.match(/timeout-minutes:\s*(\d+)/)?.[1]);
  assert.ok(CONVERGE_RUN_BUDGET_MS < timeoutMinutes * 60 * 1000 - 60_000, `budget ${CONVERGE_RUN_BUDGET_MS} vs timeout ${timeoutMinutes}m`);
  // Re-runs only ever target the required-check workflows and this convergence.
  assert.deepEqual(workflowsToRedispatch(['test', 'EKODI AI Orchestration Gate', 'unknown']), ['ci.yml', 'ekodi-ai-orchestration-gate.yml']);
});
