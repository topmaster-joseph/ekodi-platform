// CONVERGE-STUCK-CHECK-001
// Observed 2026-10-22 (#5625): a required `test` job stayed `in_progress` for
// over an hour after its workflow run had already completed with success. The
// convergence loop only accepts a completed required check, so it idled until
// the 12-minute workflow timeout three times and the recovery PR parked.
//
// These helpers are pure so the decision is unit-tested: a required check is
// "stuck" only when it has no successful completion on the head AND every
// open run of it is either orphaned (its workflow run already completed) or
// older than the stuck threshold. A healthy in-flight run is never re-run.

export const CONVERGE_REQUIRED_WORKFLOWS = Object.freeze({
  test: 'ci.yml',
  'EKODI AI Orchestration Gate': 'ekodi-ai-orchestration-gate.yml',
});

export const CONVERGE_STUCK_MS = 8 * 60 * 1000;
export const CONVERGE_RUN_BUDGET_MS = 10 * 60 * 1000;
export const CONVERGE_MAX_RUNS_PER_HEAD = 8;

const PASSING = new Set(['success', 'neutral', 'skipped']);

export function isStuckCheckRun(run, workflowRun, nowMs, stuckMs = CONVERGE_STUCK_MS) {
  if (!run || run.status === 'completed') return false;
  if (workflowRun && workflowRun.status === 'completed') return true;
  const started = Date.parse(String(run.started_at || ''));
  return Number.isFinite(started) && nowMs - started > stuckMs;
}

export function stuckRequiredChecks(required, checkRuns, workflowRunBySuite, nowMs, stuckMs = CONVERGE_STUCK_MS) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  const suites = workflowRunBySuite instanceof Map ? workflowRunBySuite : new Map();
  return required.filter(name => {
    const mine = runs.filter(run => run?.name === name && run?.app?.slug === 'github-actions');
    if (mine.some(run => run.status === 'completed' && PASSING.has(run.conclusion))) return false;
    const open = mine.filter(run => run.status !== 'completed');
    return open.length > 0 && open.every(run => isStuckCheckRun(run, suites.get(run.check_suite?.id), nowMs, stuckMs));
  });
}

export function workflowsToRedispatch(stuckNames) {
  return [...new Set((stuckNames || []).map(name => CONVERGE_REQUIRED_WORKFLOWS[name]).filter(Boolean))];
}

export function mayHandOff(convergeRunsForHead, max = CONVERGE_MAX_RUNS_PER_HEAD) {
  return Number(convergeRunsForHead) < max;
}
