import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unapprovedReleaseRunIds } from '../scripts/lib/converge-unapproved-runs.mjs';

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
  assert.match(src, /import \{ unapprovedReleaseRunIds \} from '\.\/lib\/converge-unapproved-runs\.mjs';/);
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
