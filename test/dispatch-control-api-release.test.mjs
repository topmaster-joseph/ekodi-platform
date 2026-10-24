import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchControlApiRelease } from '../scripts/dispatch-control-api-release.mjs';
import { workflowDispatchCallProblems } from '../scripts/lib/worker-bundle-graph.mjs';

const sha = '55007beeb1b60bfb3ed7fafe8fd39e4f225c5c83';
const orchBranch = 'ai/claude/orch_recovery_5cb5b2aa596932ec312fd3269661e098';

function github({ runs = [], pulls = [], dispatchStatus = 204 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('/runs?')) return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
    if (url.endsWith(`/commits/${sha}/pulls`)) return new Response(JSON.stringify(pulls), { status: 200 });
    if (url.endsWith('/dispatches')) return new Response(null, { status: dispatchStatus });
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchImpl };
}
const base = { repo: 'topmaster-joseph/ekodi-platform', sha, token: 't', sleep: async () => {}, log: () => {} };
const mergedOrchPr = { number: 5788, merged_at: '2026-10-23T23:02:15Z', base: { ref: 'main' }, head: { ref: orchBranch } };

test('an existing push or dispatched Control API run for the exact SHA is not duplicated', async () => {
  for (const event of ['push', 'workflow_dispatch']) {
    const gh = github({ runs: [{ id: 9, head_sha: sha, event }] });
    const result = await dispatchControlApiRelease({ ...base, fetchImpl: gh.fetchImpl });
    assert.equal(result.dispatched, false, event);
    assert.ok(!gh.calls.some(call => call.url.endsWith('/dispatches')), event);
  }
});

test('otherwise it dispatches with the merged orchestrator receipt', async () => {
  const gh = github({ pulls: [mergedOrchPr] });
  const result = await dispatchControlApiRelease({ ...base, fetchImpl: gh.fetchImpl });
  assert.equal(result.dispatched, true);
  const dispatch = gh.calls.find(call => call.url.endsWith('/actions/workflows/deploy-control-api.yml/dispatches'));
  assert.deepEqual(dispatch.body, { ref: 'main', inputs: { release_branch_ref: orchBranch, release_task_id: 'orch_recovery_5cb5b2aa596932ec312fd3269661e098' } });
  assert.equal(gh.calls.filter(call => call.url.includes('/runs?')).length, 3, 'run lookup retried before dispatching');
});

test('a SHA without a merged orchestrator-issued PR fails closed without dispatching', async () => {
  for (const pulls of [[], [{ ...mergedOrchPr, head: { ref: 'ai/claude/worker-lane-graph-001' } }], [{ ...mergedOrchPr, merged_at: null }]]) {
    const gh = github({ pulls });
    await assert.rejects(dispatchControlApiRelease({ ...base, fetchImpl: gh.fetchImpl }), /orchestrator-issued PR/);
    assert.ok(!gh.calls.some(call => call.url.endsWith('/dispatches')));
  }
});

test('a rejected dispatch is reported, not swallowed', async () => {
  const gh = github({ pulls: [mergedOrchPr], dispatchStatus: 422 });
  await assert.rejects(dispatchControlApiRelease({ ...base, fetchImpl: gh.fetchImpl }), /HTTP 422/);
});

// CI contract: no workflow may run another workflow without its required inputs.
test('every gh workflow run call passes the target workflow required inputs', () => {
  assert.deepEqual(workflowDispatchCallProblems(process.cwd()), []);
});

test('the four former raw Control API dispatches use the receipt-aware dispatcher', () => {
  for (const file of ['validate-ai-provider-control.yml', 'marketing-admin-control-dispatch.yml', 'marketing-ledger-control-dispatch.yml', 'marketing-store-connectors-dispatch.yml']) {
    const source = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
    assert.match(source, /run: node scripts\/dispatch-control-api-release\.mjs/, file);
    assert.match(source, /pull-requests: read/, file);
    assert.doesNotMatch(source, /gh workflow run deploy-control-api\.yml/, file);
  }
});
