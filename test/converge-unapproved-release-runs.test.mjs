import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unapprovedReleaseRunIds, staleParkedReleaseRunIds, BACKLOG_BATCH } from '../scripts/lib/converge-unapproved-runs.mjs';

const branch = 'ai/claude/orch_recovery_6d82c41bd148c2c7be0daac915b3690d';
const headSha = '6d82c41bd148c2c7be0daac915b3690d00000000';
const bot = { login: 'github-actions[bot]' };
const run = (id, extra = {}) => ({ id, status: 'completed', conclusion: 'action_required', event: 'pull_request', head_branch: branch, head_sha: headSha, actor: bot, triggering_actor: bot, ...extra });

test('only bot-parked (completed + action_required) pull_request runs on this exact release head are selected', () => {
  const runs = [
    run(1),
    run(2, { conclusion: 'failure' }),
    run(9, { status: 'queued', conclusion: null }),
    run(10, { conclusion: 'success' }),
    run(3, { event: 'workflow_dispatch' }),
    run(4, { head_sha: 'f'.repeat(40) }),
    run(5, { head_branch: 'ai/claude/orch_recovery_other' }),
    run(6, { actor: { login: 'topmaster-joseph' }, triggering_actor: { login: 'topmaster-joseph' } }),
    run(7, { triggering_actor: { login: 'topmaster-joseph' } }),
    run(8),
  ];
  assert.deepEqual(unapprovedReleaseRunIds(runs, { branch, headSha }), [1, 8]);
});

test('task branches, main and malformed input never cancel anything', () => {
  for (const other of ['ai/claude/admin-three-level-layout-20261025', 'main', 'orch_recovery_x', '']) {
    assert.deepEqual(unapprovedReleaseRunIds([run(1, { head_branch: other })], { branch: other, headSha }), []);
  }
  assert.deepEqual(unapprovedReleaseRunIds([run(1)], { branch, headSha: 'abc' }), []);
  assert.deepEqual(unapprovedReleaseRunIds(null, { branch, headSha }), []);
  assert.deepEqual(unapprovedReleaseRunIds([run('9')], { branch, headSha }), []);
});

test('convergence retires parked runs right before merging and never blocks the release', async () => {
  const src = await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ unapprovedReleaseRunIds, staleParkedReleaseRunIds \} from '\.\/lib\/converge-unapproved-runs\.mjs';/);
  assert.match(src, /status=action_required&event=pull_request/);
  // Parked runs are already completed (conclusion action_required), so cancel is impossible.
  assert.match(src, /api\('\/actions\/runs\/'\+id,\{method:'DELETE'\}\)/);
  assert.doesNotMatch(src, /\/actions\/runs\/'\+id\+'\/cancel'/);
  const fn = src.slice(src.indexOf('async function retireUnapprovedReleaseRuns'), src.indexOf('async function dispatchWorkflow'));
  assert.match(fn, /\}catch\(error\)\{/, 'lookup or cancel errors are logged, not thrown');
  assert.doesNotMatch(fn, /fail\(/);
  assert.ok(src.indexOf('await retireUnapprovedReleaseRuns();') < src.indexOf("api('/pulls/'+pr.number+'/merge'"));
  const wf = await readFile(new URL('../.github/workflows/converge-orchestrated-pr-merge.yml', import.meta.url), 'utf8');
  assert.match(wf, /actions: write/);
});

test('backlog sweep removes only old parked runs from other release branches, in bounded batches', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  const old = '2026-10-26T20:00:00Z', fresh = '2026-10-26T23:30:00Z';
  const other = 'ai/chatgpt/orch_recovery_fe0b3d8098f38b7a762081d0a17e6137';
  const runs = [
    run(1, { head_branch: other, created_at: old }),
    run(2, { head_branch: other, created_at: fresh }),
    run(3, { created_at: old }),
    run(4, { head_branch: 'ai/claude/some-task', created_at: old }),
    run(5, { head_branch: other, created_at: old, conclusion: 'failure' }),
    run(6, { head_branch: other, created_at: old, triggering_actor: { login: 'topmaster-joseph' } }),
    run(7, { head_branch: other, created_at: 'not-a-date' }),
    run(8, { head_branch: other, created_at: old }),
  ];
  assert.deepEqual(staleParkedReleaseRunIds(runs, { branch, nowMs: now }), [1, 8]);
  assert.deepEqual(staleParkedReleaseRunIds(runs, { branch, nowMs: now, limit: 1 }), [1]);
  assert.deepEqual(staleParkedReleaseRunIds(runs, { branch, nowMs: NaN }), []);
  assert.equal(BACKLOG_BATCH, 100);
  const many = Array.from({ length: 150 }, (_, i) => run(100 + i, { head_branch: other, created_at: old }));
  assert.equal(staleParkedReleaseRunIds(many, { branch, nowMs: now }).length, 100);
});

test('backlog sweep runs inside the non-blocking retire step', async () => {
  const src = await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('async function retireUnapprovedReleaseRuns'), src.indexOf('async function dispatchWorkflow'));
  assert.ok(fn.indexOf('parked-release-backlog-swept') > fn.indexOf('unapproved-release-runs-removed'), 'own head first, backlog second');
  assert.ok(fn.indexOf('parked-release-backlog-swept') < fn.indexOf('}catch(error){'), 'backlog errors are caught too');
});
