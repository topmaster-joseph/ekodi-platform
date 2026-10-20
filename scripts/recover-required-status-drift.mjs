import { pathToFileURL } from 'node:url';

// Head and orchestration statuses are published by independent CI workflows.
// Wait for them without weakening the production gate or treating pending as passed.
const REQUIRED = ['test', 'EKODI AI Orchestration Gate'];

export function latestStatusByContext(statuses) {
  const result = new Map();
  // GitHub statuses are newest first; historic observations must not win.
  for (const status of Array.isArray(statuses) ? statuses : []) {
    const context = String(status?.context || '');
    if (context && !result.has(context)) result.set(context, status);
  }
  return result;
}

export async function waitForVerifiedHeadStatus({
  getStatuses, head, required = REQUIRED,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 90000, pollMs = 3000,
}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const data = await getStatuses(head);
    const map = latestStatusByContext(data.statuses);
    const failed = required.filter(context => ['failure','error'].includes(map.get(context)?.state));
    if (failed.length) throw new Error('required head status failed: ' + failed.join(', '));
    if (required.every(context => map.get(context)?.state === 'success')) return map;
    if (now() >= deadline) {
      throw new Error('required head status still pending after grace period: ' +
        required.filter(context => map.get(context)?.state !== 'success').join(', '));
    }
    await sleep(pollMs);
  }
}

// A closed PR (superseded by an orchestrator recovery PR, or already merged)
// has no live merge commit to reconcile. Throwing here would trigger the CI
// "revoke" step and overwrite the shared head commit's `test` status with
// failure, poisoning the open PR that now owns that commit. Treat it as a no-op.
export function closedPrNoop(pr) {
  return pr?.state === 'closed';
}

export function verifiedHeadPr(pr, expectedHead) {
  if (pr?.state !== 'open' || pr?.draft === true || pr?.base?.ref !== 'main')
    throw new Error('PR is no longer eligible for merge status reconciliation');
  if (pr?.head?.sha !== expectedHead) throw new Error('PR head changed during status reconciliation');
  const mergeSha = String(pr?.merge_commit_sha || '');
  if (!/^[a-f0-9]{40}$/i.test(mergeSha)) throw new Error('current merge sha unavailable');
  return mergeSha;
}

// 2026-10-20: `main` moves constantly, so GitHub briefly reports no test-merge
// SHA (recomputing) or replaces it mid-step. Failing here made the revoke step
// overwrite a passing head `test` status. Only these merge-SHA races are retried,
// with a fresh PR read each time; head/base/state/draft checks and status
// verification are unchanged and still fail closed.
export const TRANSIENT_MERGE_SHA_ERRORS = Object.freeze([
  'current merge sha unavailable',
  'merge SHA moved during status reconciliation',
  'recovery verification failed',
]);
export function isTransientMergeShaError(error) {
  const message = String(error?.message || error || '');
  return TRANSIENT_MERGE_SHA_ERRORS.some(prefix => message.startsWith(prefix));
}

export async function reconcileMergeStatuses({
  api, pr, head, by, required = REQUIRED, attempts = 6,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), backoffMs = 5000,
}) {
  for (const context of required) {
    const source = by.get(context);
    if (source?.state !== 'success' || !source.target_url)
      throw new Error('required head evidence missing or unlinked: ' + context);
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const currentPr = await api('/pulls/' + pr);
      if (closedPrNoop(currentPr)) return { closed: true };
      const mergeSha = verifiedHeadPr(currentPr, head);
      for (const context of required) {
        const source = by.get(context);
        await api('/statuses/' + mergeSha, {
          method: 'POST',
          body: JSON.stringify({
            state: 'success', context,
            description: 'Recovered from verified head ' + head.slice(0, 12),
            target_url: source.target_url,
          }),
        });
      }
      const finalPr = await api('/pulls/' + pr);
      if (closedPrNoop(finalPr)) return { closed: true };
      if (verifiedHeadPr(finalPr, head) !== mergeSha) throw new Error('merge SHA moved during status reconciliation');
      const verify = await api('/commits/' + mergeSha + '/status');
      const latest = latestStatusByContext(verify.statuses);
      for (const context of required)
        if (latest.get(context)?.state !== 'success') throw new Error('recovery verification failed: ' + context);
      return { mergeSha, attempt };
    } catch (error) {
      if (!isTransientMergeShaError(error)) throw error;
      lastError = error;
      if (attempt < attempts) await sleep(backoffMs * attempt);
    }
  }
  throw lastError;
}

async function main() {
  const repo = String(process.env.GITHUB_REPOSITORY || '');
  const token = String(process.env.GH_TOKEN || '');
  const pr = String(process.env.PR_NUMBER || '');
  const head = String(process.env.HEAD_SHA || '');
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) || !token ||
      !/^\d+$/.test(pr) || !/^[a-f0-9]{40}$/i.test(head))
    throw new Error('missing or invalid recovery inputs');

  const api = async (route, init = {}) => {
    const response = await fetch('https://api.github.com/repos/' + repo + route, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json', ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new Error('GitHub API HTTP ' + response.status +
      ': ' + String(await response.text()).slice(0, 300));
    return response.status === 204 ? null : response.json();
  };

  const initialPr = await api('/pulls/' + pr);
  if (closedPrNoop(initialPr)) {
    console.log('[EKODI][REQUIRED-STATUS-RECOVERY] PR #' + pr + ' is closed' +
      (initialPr?.merged ? ' (merged)' : ' (superseded or abandoned)') + '; no merge commit to reconcile');
    return;
  }
  const by = await waitForVerifiedHeadStatus({
    getStatuses: sha => api('/commits/' + sha + '/status'), head,
  });
  const result = await reconcileMergeStatuses({ api, pr, head, by });
  if (result.closed) {
    console.log('[EKODI][REQUIRED-STATUS-RECOVERY] PR #' + pr + ' closed during reconciliation; no-op');
    return;
  }
  const mergeSha = result.mergeSha;
  console.log('[EKODI][REQUIRED-STATUS-RECOVERY] ' + mergeSha + ' verified');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
