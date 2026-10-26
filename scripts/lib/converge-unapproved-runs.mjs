// CONVERGE-UNAPPROVED-RUNS-001
// Orchestrator release PRs (ai/<agent>/orch_*) are opened by github-actions[bot].
// GitHub parks every pull_request workflow triggered by that bot in
// `action_required` (approval needed); none of them ever executes. Release
// evidence comes from the task-branch PR checks and the orchestrator statuses,
// not from these parked runs. Left alone they flip to a red zero-job
// "failure" when the merged branch is deleted, so each release showed ~14
// false failures.
// GitHub reports a parked run as status=completed, conclusion=action_required,
// so it cannot be cancelled (verified on release #6084). Convergence therefore
// deletes exactly those never-executed, log-less run records before merging.
export const ORCH_RELEASE_BRANCH = /^ai\/[a-z0-9-]+\/orch_[A-Za-z0-9_-]+$/;
export const RELEASE_PR_BOT = 'github-actions[bot]';

export function unapprovedReleaseRunIds(runs, { branch, headSha }) {
  if (!ORCH_RELEASE_BRANCH.test(String(branch || ''))) return [];
  if (!/^[a-f0-9]{40}$/i.test(String(headSha || ''))) return [];
  return (Array.isArray(runs) ? runs : [])
    .filter(run => run
      && run.status === 'completed'
      && run.conclusion === 'action_required'
      && run.event === 'pull_request'
      && run.head_branch === branch
      && run.head_sha === headSha
      && run.actor?.login === RELEASE_PR_BOT
      && run.triggering_actor?.login === RELEASE_PR_BOT)
    .map(run => run.id)
    .filter(id => Number.isSafeInteger(id) && id > 0);
}
