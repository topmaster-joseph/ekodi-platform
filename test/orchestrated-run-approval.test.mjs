import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectApprovableRuns, isOrchestratorBranch, MAX_APPROVALS_PER_CYCLE } from '../scripts/orchestrated-run-approval.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const repo = 'topmaster-joseph/ekodi-platform';
const branch = 'ai/claude/orch_recovery_971e5fa026ea3b536dad3ed9fe5ed238';
const headSha = '971e5fa026ea3b536dad3ed9fe5ed238be2eec13';
const bot = { login: 'github-actions[bot]' };
const run = (over = {}) => ({
  id: 101, status: 'completed', conclusion: 'action_required', event: 'pull_request',
  head_branch: branch, head_sha: headSha,
  head_repository: { full_name: repo }, repository: { full_name: repo },
  triggering_actor: bot, actor: bot, ...over,
});

test('approves only parked bot pull_request runs on the exact orchestrator head', () => {
  assert.deepEqual(selectApprovableRuns({ runs: [run()], repo, branch, headSha }), [101]);
});

test('rejects every run that is not an exact-head bot recovery run', () => {
  const rejected = [
    run({ conclusion: 'success' }),
    run({ status: 'in_progress', conclusion: null }),
    run({ event: 'pull_request_target' }),
    run({ event: 'push' }),
    run({ head_sha: 'a'.repeat(40) }),
    run({ head_branch: 'ai/claude/issue-3805-p1-asset-inventory' }),
    run({ head_repository: { full_name: 'attacker/ekodi-platform' } }),
    run({ triggering_actor: { login: 'someone' } }),
    run({ actor: { login: 'someone' } }),
    run({ id: 'x' }),
    run({ id: 0 }),
  ];
  assert.deepEqual(selectApprovableRuns({ runs: rejected, repo, branch, headSha }), []);
});

test('fails closed on non-orchestrator branch, bad SHA or malformed input', () => {
  assert.equal(isOrchestratorBranch('ai/claude/issue-3805-p1-asset-inventory'), false);
  assert.equal(isOrchestratorBranch(branch), true);
  const nonOrch = 'ai/claude/issue-3805-p1-asset-inventory';
  assert.deepEqual(selectApprovableRuns({ runs: [run({ head_branch: nonOrch })], repo, branch: nonOrch, headSha }), []);
  assert.deepEqual(selectApprovableRuns({ runs: [run()], repo, branch, headSha: 'short' }), []);
  assert.deepEqual(selectApprovableRuns({ runs: null, repo, branch, headSha }), []);
  assert.deepEqual(selectApprovableRuns({ runs: [run()], repo: '', branch, headSha }), []);
});

test('approval volume is bounded per cycle', () => {
  const many = Array.from({ length: MAX_APPROVALS_PER_CYCLE + 20 }, (_, i) => run({ id: i + 1 }));
  assert.equal(selectApprovableRuns({ runs: many, repo, branch, headSha }).length, MAX_APPROVALS_PER_CYCLE);
});

test('converger approves parked runs only while required checks are pending, then keeps all merge gates', () => {
  const source = read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(source, /import \{selectApprovableRuns\} from '\.\/orchestrated-run-approval\.mjs'/);
  assert.match(source, /if\(pending\.length&&cycle%10===0\)await approveParkedRecoveryRuns\(\)/);
  assert.match(source, /\/actions\/runs\/'\+id\+'\/approve'/);
  // Release authority unchanged: receipt, required statuses and authentic check runs still gate merge.
  assert.match(source, /release receipt is not authorized/);
  assert.match(source, /if\(!await verifiedCheckRuns\(headSha\)\)/);
  assert.ok(source.indexOf('approveParkedRecoveryRuns()') < source.indexOf("/merge',{method:'PUT'"));
});

test('recovery lane dispatches the converger only when parked, never weakening the Human Gate', () => {
  const source = read('scripts/recover-release-provenance.mjs');
  assert.match(source, /converge-orchestrated-pr-merge\.yml\/dispatches/);
  assert.match(source, /body:JSON\.stringify\(\{ref:branchRef\}\)/);
  assert.ok(source.indexOf("out('merge_condition',reason)") < source.indexOf('converge-orchestrated-pr-merge.yml/dispatches'));
  assert.match(source, /findExactHumanGateApproval\(/);
  const evidence = read('scripts/release-human-gate-evidence.mjs');
  assert.match(evidence, /comment\.body!==approvalMarker/);
  const workflow = read('.github/workflows/converge-orchestrated-pr-merge.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions: write/);
});
