import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Explicit owner-controlled event handoff. No Cloudflare mutations in this dispatcher.
// Only the existing guarded C3 workflow can detach the exact retired browser host.
const OWNER = 'topmaster-joseph';
const REPO = OWNER + '/ekodi-platform';
const ISSUE = 6533;
const RECOVERY_PR = 6535;
const MERGED_SHA = '50f8e7859a6d9b3a5213f7e7530664d6611099cd';
const TASK = 'orch_recovery_ea4e45c278acbdb16ca379e0419740b4';
const BRANCH = 'ai/chatgpt/' + TASK;
const COMMAND = 'EKODI-CHURCH-C3-EXECUTE';
const CANONICAL = 'https://ekodi.kr/ekodichurch/';
const TARGET_WORKFLOW = 'retire-church-legacy-domain.yml';

export function authorizedIssueCommand(event, env) {
  return env.GITHUB_EVENT_NAME === 'issue_comment'
    && env.GITHUB_REPOSITORY === REPO
    && env.GITHUB_ACTOR === OWNER
    && event.action === 'created'
    && event.issue?.number === ISSUE
    && !event.issue?.pull_request
    && event.comment?.user?.login === OWNER
    && event.sender?.login === OWNER
    && event.comment?.body?.trim() === COMMAND;
}

export function verifiedRecoveryPr(pr) {
  return pr?.number === RECOVERY_PR
    && pr?.state === 'closed'
    && pr?.merged === true
    && pr?.merged_at
    && pr?.merge_commit_sha === MERGED_SHA
    && pr?.base?.ref === 'main'
    && pr?.head?.ref === BRANCH
    && pr?.head?.repo?.full_name === REPO;
}

export function verifiedReceipt(body, status) {
  return status === 200
    && body?.authorized === true
    && body?.authority === 'ekodi-orchestrator'
    && body?.taskId === TASK
    && body?.branchRef === BRANCH
    && !['blocked','failed','cancelled'].includes(String(body.state || '').toLowerCase());
}

async function jsonResponse(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'ekodi-church-C3-gated-dispatch', ...headers },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('Required GitHub/EKODI verification unavailable: HTTP ' + response.status);
  return response.json();
}

async function assertCanonicalHealthy(fetchImpl) {
  for (const [url, marker] of [[CANONICAL, 'EKODI CHURCH'], [CANONICAL + 'my/', 'MY PAGE']]) {
    const response = await fetchImpl(url, {
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000)
    });
    if (response.status !== 200) throw new Error('Canonical Church preflight HTTP ' + response.status);
    if (!(await response.text()).includes(marker)) throw new Error('Canonical Church preflight marker missing: ' + marker);
  }
}

export async function dispatch({ event, env = process.env, fetchImpl = fetch } = {}) {
  if (!authorizedIssueCommand(event, env)) {
    throw new Error('Only the exact repository-owner approval on the tracked Church C3 issue may dispatch');
  }
  if (!env.GH_TOKEN) throw new Error('GitHub Actions token missing');
  const auth = { authorization: 'Bearer ' + env.GH_TOKEN };
  const pr = await jsonResponse(fetchImpl, 'https://api.github.com/repos/' + REPO + '/pulls/' + RECOVERY_PR, auth);
  if (!verifiedRecoveryPr(pr)) throw new Error('Official merged EKODI recovery PR does not match the pinned release');
  const receiptUrl = new URL('https://ekodi.kr/api/orchestrator/release-receipt');
  receiptUrl.searchParams.set('taskId', TASK);
  receiptUrl.searchParams.set('branchRef', BRANCH);
  const receiptResponse = await fetchImpl(receiptUrl, {
    headers: { accept:'application/json', 'user-agent':'ekodi-church-C3-gated-dispatch' },
    signal: AbortSignal.timeout(12000)
  });
  const receiptBody = await receiptResponse.json().catch(() => ({}));
  if (!verifiedReceipt(receiptBody, receiptResponse.status)) {
    throw new Error('EKODI Orchestrator C3 release receipt not authorized');
  }
  await assertCanonicalHealthy(fetchImpl);
  const response = await fetchImpl(
    'https://api.github.com/repos/' + REPO + '/actions/workflows/' + TARGET_WORKFLOW + '/dispatches',
    {
      method: 'POST',
      headers: {
        ...auth, accept: 'application/vnd.github+json',
        'content-type': 'application/json', 'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { release_branch_ref: BRANCH, release_task_id: TASK }
      }),
      signal: AbortSignal.timeout(12000)
    }
  );
  if (response.status !== 204) throw new Error('Official guarded Church C3 workflow dispatch rejected HTTP ' + response.status);
  return { dispatched: true, issue: ISSUE, pr: RECOVERY_PR, workflow: TARGET_WORKFLOW };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GitHub event payload missing');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  dispatch({ event }).then(result => console.log('Authorized EKODI C3 workflow dispatched: ' + JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
