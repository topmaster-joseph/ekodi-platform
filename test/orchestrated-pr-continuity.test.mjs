import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideContinuityReplay } from '../scripts/reconcile-orchestrated-pr-continuity.mjs';

const now = Date.parse('2026-10-12T09:00:00Z');
const sha = 'a'.repeat(40);
const repo = 'topmaster-joseph/ekodi-platform';
const branch = 'ai/chatgpt/orch_00000000-0000-4000-8000-000000000001';
const original = () => ({
  state: 'open', draft: false, base: { ref: 'main' },
  head: { ref: branch, sha, repo: { full_name: repo } },
  updated_at: '2026-10-12T08:00:00Z',
});
const run = (conclusion, event = 'push', date = '2026-10-12T08:00:00Z') => ({
  head_sha: sha, status: 'completed', conclusion, event, created_at: date,
});

test('replays a missed authorized orchestration trigger after a grace period', () => {
  const result = decideContinuityReplay(original(), [], now, repo);
  assert.equal(result.replay, true);
  assert.equal(result.reason, 'recover-missed-trigger');
  assert.equal(result.branch, branch);
});

test('does not replay when the push event can still arrive', () => {
  const candidate = original();
  candidate.updated_at = '2026-10-12T08:55:00Z';
  assert.equal(decideContinuityReplay(candidate, [], now, repo).reason, 'within-event-grace-period');
});

test('only transient cancellation or timeout may be replayed', () => {
  assert.equal(decideContinuityReplay(original(), [run('cancelled')], now, repo).replay, true);
  assert.equal(decideContinuityReplay(original(), [run('timed_out')], now, repo).replay, true);
  assert.equal(decideContinuityReplay(original(), [run('failure')], now, repo).replay, false);
  assert.equal(decideContinuityReplay(original(), [run('success')], now, repo).replay, false);
});

test('does not interfere with running jobs or replay more than twice per SHA', () => {
  const active = { ...run(null), status: 'in_progress' };
  assert.equal(decideContinuityReplay(original(), [active], now, repo).reason, 'existing-run-active');
  assert.equal(decideContinuityReplay(original(), [
    run('cancelled', 'workflow_dispatch', '2026-10-12T07:00:00Z'),
    run('cancelled', 'workflow_dispatch', '2026-10-12T08:00:00Z'),
  ], now, repo).reason, 'replay-budget-exhausted');
});

test('closed/draft/foreign/non-orchestrator changes never join replay', () => {
  const variants = [
    { ...original(), draft: true },
    { ...original(), state: 'closed' },
    { ...original(), head: { ...original().head, repo: { full_name: 'another/repo' } } },
    { ...original(), head: { ...original().head, ref: 'ai/chatgpt/ordinary-feature' } },
  ];
  for (const candidate of variants) {
    assert.equal(decideContinuityReplay(candidate, [], now, repo).replay, false);
  }
});

test('continuity workflow is receipt-gated, bounded, and never bypasses guarded release', () => {
  const script = readFileSync(new URL('../scripts/reconcile-orchestrated-pr-continuity.mjs', import.meta.url), 'utf8');
  const watchdog = readFileSync(new URL('../.github/workflows/reconcile-orchestrated-pr-continuity.yml', import.meta.url), 'utf8');
  const converger = readFileSync(new URL('../.github/workflows/converge-orchestrated-pr-merge.yml', import.meta.url), 'utf8');
  assert.match(watchdog, /cron: '11,41 \* \* \* \*'/);
  assert.match(watchdog, /ref: main/);
  assert.match(watchdog, /actions: write/);
  assert.match(converger, /workflow_dispatch:/);
  assert.match(script, /hasAuthorizedReceipt\(planned\.taskId, planned\.branch\)/);
  assert.match(script, /current\.head\?\.sha !== planned\.sha/);
  assert.match(script, /MAX_DISPATCH_ATTEMPTS_PER_SHA = 2/);
  assert.match(script, /MAX_DISPATCHES_PER_SWEEP = 3/);
  assert.doesNotMatch(script, /\/pulls\/.*\/merge/);
  assert.doesNotMatch(script, /guarded-worker-release|guarded-pages-release|wrangler deploy/);
});
