// Fail-closed selection of workflow runs the orchestrator may approve on its own
// recovery PRs (issue #3805).
//
// GitHub parks `pull_request` runs as `action_required` when the PR was opened
// by github-actions[bot] (the official recovery lane). Approving them only lets
// the existing required CI execute; it never approves a release, never marks a
// check green and never touches any branch other than an orchestrator-issued one
// at the exact head SHA. Owner Human Gate evidence stays the only release
// authority (release-human-gate-evidence.mjs is unchanged).

export const ORCHESTRATOR_BRANCH_PATTERN = /^ai\/([a-z0-9][a-z0-9._-]{0,31})\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i;
export const RECOVERY_BOT_LOGIN = 'github-actions[bot]';
export const MAX_APPROVALS_PER_CYCLE = 60;

export function isOrchestratorBranch(branch) {
  return ORCHESTRATOR_BRANCH_PATTERN.test(String(branch || ''));
}

export function selectApprovableRuns({ runs, repo, branch, headSha }) {
  if (!Array.isArray(runs)) return [];
  if (!repo || !isOrchestratorBranch(branch)) return [];
  if (!/^[a-f0-9]{40}$/i.test(String(headSha || ''))) return [];
  return runs.filter((run) =>
    run?.status === 'completed' &&
    run?.conclusion === 'action_required' &&
    run?.event === 'pull_request' &&
    run?.head_branch === branch &&
    run?.head_sha === headSha &&
    run?.head_repository?.full_name === repo &&
    run?.repository?.full_name === repo &&
    run?.triggering_actor?.login === RECOVERY_BOT_LOGIN &&
    run?.actor?.login === RECOVERY_BOT_LOGIN &&
    Number.isSafeInteger(run?.id) && run.id > 0
  ).slice(0, MAX_APPROVALS_PER_CYCLE).map((run) => run.id);
}
