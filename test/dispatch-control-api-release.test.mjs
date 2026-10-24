import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONTROL_API_DISPATCH_GROUP_PREFIX, dispatchControlApiRelease } from '../scripts/dispatch-control-api-release.mjs';
import { workflowDispatchCallProblems } from '../scripts/lib/worker-bundle-graph.mjs';

const sha = '55007beeb1b60bfb3ed7fafe8fd39e4f225c5c83';
const later = '964a8206c6f9185f22d6b4534954d16a89a586ac';
const orchBranch = 'ai/claude/orch_recovery_5cb5b2aa596932ec312fd3269661e098';
const committedAt = Date.parse('2026-10-23T23:02:15Z');

// Stateful fake GitHub: a successful dispatch creates a workflow_dispatch run on the
// current main head, which every later run lookup (any caller) can see.
function github({ runs = [], pulls = [], dispatchStatus = 204, mainHead = sha, descendants = [later], clock } = {}) {
  const state = { runs: [...runs], calls: [], dispatches: 0 };
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    state.calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.endsWith(`/commits/${sha}`)) return json({ commit: { committer: { date: new Date(committedAt).toISOString() } } });
    if (url.includes('/actions/workflows/deploy-control-api.yml/runs?')) return json({ workflow_runs: [...state.runs].reverse() });
    if (url.endsWith(`/commits/${sha}/pulls`)) return json(pulls);
    const compare = url.match(/\/compare\/([a-f0-9]+)\.\.\.([a-f0-9]+)$/);
    if (compare) return json({ status: descendants.includes(compare[2]) ? 'ahead' : 'diverged' });
    if (url.endsWith('/dispatches') && method === 'POST') {
      if (dispatchStatus === 204) {
        state.dispatches += 1;
        state.runs.push({ id: 1000 + state.dispatches, event: 'workflow_dispatch', head_sha: mainHead, created_at: new Date(clock.now()).toISOString(), conclusion: null });
      }
      return new Response(null, { status: dispatchStatus });
    }
    return json({}, 404);
  };
  return { state, fetchImpl };
}

function clockAt(ms) {
  const clock = { t: ms, now: () => clock.t };
  clock.sleep = async wait => { clock.t += wait; };
  return clock;
}

const mergedOrchPr = { number: 5788, merged_at: '2026-10-23T23:02:15Z', base: { ref: 'main' }, head: { ref: orchBranch } };
const options = (gh, clock) => ({ repo: 'topmaster-joseph/ekodi-platform', sha, token: 't', fetchImpl: gh.fetchImpl, sleep: clock.sleep, now: clock.now, log: () => {} });

test('a push run on this SHA, or a dispatched run whose head contains it, is not duplicated', async () => {
  for (const run of [
    { id: 9, event: 'push', head_sha: sha, created_at: '2026-10-23T23:02:20Z' },
    { id: 9, event: 'workflow_dispatch', head_sha: sha, created_at: '2026-10-23T23:02:30Z' },
    { id: 9, event: 'workflow_dispatch', head_sha: later, created_at: '2026-10-23T23:05:00Z' },
  ]) {
    const clock = clockAt(committedAt + 60_000);
    const gh = github({ runs: [run], pulls: [mergedOrchPr], clock });
    const result = await dispatchControlApiRelease(options(gh, clock));
    assert.equal(result.dispatched, false, JSON.stringify(run));
    assert.equal(gh.state.dispatches, 0, JSON.stringify(run));
  }
});

test('runs that cannot release this SHA do not suppress a dispatch', async () => {
  for (const run of [
    { id: 9, event: 'push', head_sha: later, created_at: '2026-10-23T23:05:00Z' },
    { id: 9, event: 'workflow_dispatch', head_sha: sha, created_at: '2026-10-23T22:00:00Z' },
    { id: 9, event: 'workflow_dispatch', head_sha: sha, created_at: '2026-10-23T23:03:00Z', conclusion: 'cancelled' },
    { id: 9, event: 'workflow_dispatch', head_sha: 'ffffffffffffffffffffffffffffffffffffffff', created_at: '2026-10-23T23:05:00Z' },
  ]) {
    const clock = clockAt(committedAt + 60_000);
    const gh = github({ runs: [run], pulls: [mergedOrchPr], clock });
    const result = await dispatchControlApiRelease(options(gh, clock));
    assert.equal(result.dispatched, true, JSON.stringify(run));
  }
});

test('dispatches with the merged orchestrator receipt and waits until the run is visible', async () => {
  const clock = clockAt(committedAt + 60_000);
  const gh = github({ pulls: [mergedOrchPr], clock });
  const result = await dispatchControlApiRelease(options(gh, clock));
  assert.equal(result.dispatched, true);
  assert.equal(result.runId, 1001);
  const dispatch = gh.state.calls.find(call => call.url.endsWith('/actions/workflows/deploy-control-api.yml/dispatches'));
  assert.deepEqual(dispatch.body, { ref: 'main', inputs: { release_branch_ref: orchBranch, release_task_id: 'orch_recovery_5cb5b2aa596932ec312fd3269661e098' } });
});

// 2026-10-24 regression: four callers on 964a8206 each dispatched Control API. With the
// shared concurrency group they run one after another; each later caller must see the
// earlier dispatch, including when main advanced before the dispatch ran.
test('serialized callers dispatch Control API exactly once', async () => {
  for (const mainHead of [sha, later]) {
    const clock = clockAt(committedAt + 60_000);
    const gh = github({ pulls: [mergedOrchPr], mainHead, clock });
    const results = [];
    for (let caller = 0; caller < 4; caller++) results.push(await dispatchControlApiRelease(options(gh, clock)));
    assert.equal(gh.state.dispatches, 1, `main head ${mainHead.slice(0, 8)}`);
    assert.deepEqual(results.map(item => item.dispatched), [true, false, false, false]);
  }
});

test('a dispatch that lands while the receipt is resolved is caught by the pre-dispatch re-check', async () => {
  const clock = clockAt(committedAt + 60_000);
  const gh = github({ clock, pulls: [] });
  const inner = gh.fetchImpl;
  gh.fetchImpl = async (url, init) => {
    if (url.endsWith(`/commits/${sha}/pulls`)) {
      gh.state.runs.push({ id: 77, event: 'workflow_dispatch', head_sha: sha, created_at: new Date(clock.now()).toISOString() });
      return new Response(JSON.stringify([mergedOrchPr]), { status: 200 });
    }
    return inner(url, init);
  };
  const result = await dispatchControlApiRelease(options(gh, clock));
  assert.deepEqual([result.dispatched, result.stage, result.runId], [false, 'pre-dispatch', 77]);
  assert.equal(gh.state.dispatches, 0);
});

test('a SHA without a merged orchestrator-issued PR fails closed without dispatching', async () => {
  for (const pulls of [[], [{ ...mergedOrchPr, head: { ref: 'ai/claude/worker-lane-graph-001' } }], [{ ...mergedOrchPr, merged_at: null }]]) {
    const clock = clockAt(committedAt + 60_000);
    const gh = github({ pulls, clock });
    await assert.rejects(dispatchControlApiRelease(options(gh, clock)), /orchestrator-issued PR/);
    assert.equal(gh.state.dispatches, 0);
  }
});

test('a rejected dispatch is reported, not swallowed', async () => {
  const clock = clockAt(committedAt + 60_000);
  const gh = github({ pulls: [mergedOrchPr], dispatchStatus: 422, clock });
  await assert.rejects(dispatchControlApiRelease(options(gh, clock)), /HTTP 422/);
});

// CI contract: no workflow may run another workflow without its required inputs.
test('every gh workflow run call passes the target workflow required inputs', () => {
  assert.deepEqual(workflowDispatchCallProblems(process.cwd()), []);
});

// CI contract: every caller dispatches from its own job in the shared per-SHA group,
// so a superseded caller is cancelled without cancelling its validation.
test('every dispatcher caller runs in its own job under the shared per-SHA concurrency group', () => {
  const callers = fs.readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file))
    .filter(file => fs.readFileSync(`.github/workflows/${file}`, 'utf8').includes('scripts/dispatch-control-api-release.mjs'));
  assert.deepEqual(callers.sort(), ['marketing-admin-control-dispatch.yml', 'marketing-ledger-control-dispatch.yml', 'marketing-store-connectors-dispatch.yml', 'validate-ai-provider-control.yml']);
  for (const file of callers) {
    const source = fs.readFileSync(`.github/workflows/${file}`, 'utf8');
    const jobs = source.slice(source.search(/^jobs:\s*$/m)).split(/\n(?= {2}[A-Za-z0-9_-]+:\s*$)/m).slice(1);
    const dispatchJobs = jobs.filter(job => job.includes('scripts/dispatch-control-api-release.mjs'));
    assert.equal(dispatchJobs.length, 1, file);
    const [job] = dispatchJobs;
    assert.match(job, /^ {4}concurrency:\n {6}group: control-api-release-dispatch-\$\{\{ github\.sha \}\}\n {6}cancel-in-progress: false$/m, file);
    assert.ok(`group: ${CONTROL_API_DISPATCH_GROUP_PREFIX}`.length > 7);
    assert.doesNotMatch(job, /node --test|node --check/, `${file}: validation must not share the dispatch job`);
    assert.match(source, /pull-requests: read/, file);
    assert.doesNotMatch(source, /gh workflow run deploy-control-api\.yml/, file);
  }
});
