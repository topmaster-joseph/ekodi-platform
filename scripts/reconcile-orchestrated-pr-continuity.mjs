// Resume only previously authorized EKODI Orchestrator merge attempts.
// This dispatcher never changes code, merges a PR or deploys a service.
// The existing exact-branch release receipt and required-status gates stay authoritative.
const REPLAY_MIN_AGE_MS = 20 * 60 * 1000;
const MAX_DISPATCH_ATTEMPTS_PER_SHA = 2;
const MAX_DISPATCHES_PER_SWEEP = 3;
const WORKFLOW = 'converge-orchestrated-pr-merge.yml';
const ORCH_BRANCH = /^ai\/([a-z0-9][a-z0-9._-]{0,31})\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;

export function decideContinuityReplay(pr, runs = [], now = Date.now(), repository = '') {
  const branch = String(pr?.head?.ref || '');
  const match = ORCH_BRANCH.exec(branch);
  if (!match || pr?.draft !== false || pr?.state !== 'open' || pr?.base?.ref !== 'main') {
    return { replay: false, reason: 'not-an-open-orchestrator-pr' };
  }
  if (repository && pr?.head?.repo?.full_name !== repository) {
    return { replay: false, reason: 'foreign-head-repository' };
  }
  const sha = String(pr?.head?.sha || '');
  if (!/^[0-9a-f]{40}$/i.test(sha)) return { replay: false, reason: 'missing-head-sha' };
  const matching = runs.filter(run => run.head_sha === sha)
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  const newest = matching[0];
  if (newest && newest.status !== 'completed') return { replay: false, reason: 'existing-run-active' };
  if (newest && (newest.conclusion === 'success' || newest.conclusion === 'failure')) {
    // A failed validator needs source repair; repeating the same failing build is not recovery.
    return { replay: false, reason: 'run-completed-needs-no-blind-retry' };
  }
  const replayCount = matching.filter(run => run.event === 'workflow_dispatch').length
    + matching.reduce((sum, run) => sum + Math.max(0, Number(run.run_attempt || 1) - 1), 0);
  if (replayCount >= MAX_DISPATCH_ATTEMPTS_PER_SHA) {
    return { replay: false, reason: 'replay-budget-exhausted' };
  }
  // A run cancelled moments ago must not be replayed simply because it was queued long ago.
  const checkpoint = newest?.updated_at || newest?.created_at || pr?.updated_at;
  const checkpointMs = Date.parse(checkpoint || '');
  if (!Number.isFinite(checkpointMs) || now - checkpointMs < REPLAY_MIN_AGE_MS) {
    return { replay: false, reason: 'within-event-grace-period' };
  }
  if (newest && !['cancelled', 'timed_out', 'startup_failure'].includes(newest.conclusion)) {
    return { replay: false, reason: 'not-a-transient-run-conclusion' };
  }
  return {
    replay: true,
    reason: newest ? 'recover-transient-run' : 'recover-missed-trigger',
    branch,
    taskId: match[2],
    sha,
    runId: newest?.id ? Number(newest.id) : null,
  };
}

async function githubApi(repository, token, path, init = {}) {
  const response = await fetch('https://api.github.com/repos/' + repository + path, {
    ...init,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (init.method === 'POST' && response.status === 204) return { ok: true };
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('GitHub HTTP ' + response.status + ' at ' + path + ': ' + String(payload.message || '').slice(0, 100));
  return payload;
}

async function hasAuthorizedReceipt(taskId, branch) {
  const url = new URL('https://ekodi.kr/api/orchestrator/release-receipt');
  url.searchParams.set('taskId', taskId);
  url.searchParams.set('branchRef', branch);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ekodi-orchestrated-continuity-reconciler' },
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json().catch(() => ({}));
    return result.authorized === true
      && result.taskId === taskId
      && result.branchRef === branch
      && result.authority === 'ekodi-orchestrator'
      && !['blocked', 'failed', 'cancelled'].includes(String(result.state || '').toLowerCase());
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const repo = String(process.env.GITHUB_REPOSITORY || '').trim();
  const token = String(process.env.GH_TOKEN || '').trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) || !token) throw new Error('Missing trusted GitHub workflow context');
  const report = [];
  let dispatched = 0;
  for (let page = 1; page <= 3 && dispatched < MAX_DISPATCHES_PER_SWEEP; page++) {
    const prs = await githubApi(repo, token, '/pulls?state=open&base=main&per_page=100&page=' + page);
    for (const pr of prs) {
      if (dispatched >= MAX_DISPATCHES_PER_SWEEP) break;
      const branch = String(pr?.head?.ref || '');
      if (!ORCH_BRANCH.test(branch) || pr.draft || pr.head?.repo?.full_name !== repo) continue;
      const runsResponse = await githubApi(repo, token, '/actions/workflows/' + WORKFLOW + '/runs?branch=' + encodeURIComponent(branch) + '&per_page=30');
      const planned = decideContinuityReplay(pr, runsResponse.workflow_runs || [], Date.now(), repo);
      if (!planned.replay) {
        report.push({ pr: pr.number, state: 'deferred', reason: planned.reason });
        continue;
      }
      let approved = false;
      try { approved = await hasAuthorizedReceipt(planned.taskId, planned.branch); }
      catch (error) {
        report.push({ pr: pr.number, state: 'deferred', reason: 'release-receipt-temporarily-unavailable' });
        continue;
      }
      if (!approved) {
        report.push({ pr: pr.number, state: 'deferred', reason: 'no-authoritative-release-receipt' });
        continue;
      }
      // Recheck identity immediately before dispatch; never replay a stale SHA.
      const current = await githubApi(repo, token, '/pulls/' + pr.number);
      if (current.state !== 'open' || current.draft || current.head?.sha !== planned.sha) {
        report.push({ pr: pr.number, state: 'deferred', reason: 'pr-changed' });
        continue;
      }
      // Prefer replaying the exact transient run. This keeps recovery independent
      // from workflow_dispatch metadata on older workflow revisions.
      if (planned.reason === 'recover-transient-run' && planned.runId) {
        try {
          await githubApi(repo, token, '/actions/runs/' + planned.runId + '/rerun', { method: 'POST' });
          dispatched++;
          report.push({ pr: pr.number, state: 'dispatched', reason: planned.reason, mode: 'rerun-existing-run', runId: planned.runId, headSha: planned.sha });
        } catch (error) {
          report.push({ pr: pr.number, state: 'deferred', reason: 'transient-run-rerun-unavailable', runId: planned.runId });
        }
        continue;
      }

      // A genuinely missed trigger has no run to replay. Dispatch at most once here;
      // if GitHub reports stale workflow metadata, defer instead of failing the sweep.
      try {
        await githubApi(repo, token, '/actions/workflows/' + WORKFLOW + '/dispatches', {
          method: 'POST', body: JSON.stringify({ ref: planned.branch }),
        });
        dispatched++;
        report.push({ pr: pr.number, state: 'dispatched', reason: planned.reason, mode: 'workflow-dispatch', headSha: planned.sha });
      } catch (error) {
        const message = String(error?.message || error);
        if (message.includes('GitHub HTTP 422') && message.includes('workflow_dispatch')) {
          report.push({ pr: pr.number, state: 'deferred', reason: 'workflow-dispatch-unavailable', headSha: planned.sha });
          continue;
        }
        throw error;
      }
    }
    if (prs.length < 100) break;
  }
  console.log(JSON.stringify({ continuitySweep: true, dispatched, report }));
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
