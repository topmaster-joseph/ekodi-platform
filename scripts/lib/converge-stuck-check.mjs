// CONVERGE-STUCK-CHECK-001
// Observed 2026-10-22 (#5625): a required `test` job stayed `in_progress` for
// over an hour after its workflow run had already completed with success. The
// convergence loop only accepts a completed required check, so it idled until
// the 12-minute workflow timeout three times and the recovery PR parked.
//
// These helpers are pure so the decision is unit-tested: a required check is
// "stuck" only when there is no successful completion on the exact head and
// every incomplete check itself exceeds the age threshold. A completed
// associated suite alone is insufficient: cross-dispatch lookups can refer to
// another completed run and trigger premature CI re-dispatch.

export const CONVERGE_REQUIRED_WORKFLOWS = Object.freeze({
  test: 'ci.yml',
  'EKODI AI Orchestration Gate': 'ekodi-ai-orchestration-gate.yml',
});

export const CONVERGE_STUCK_MS = 8 * 60 * 1000;
export const CONVERGE_RUN_BUDGET_MS = 10 * 60 * 1000;
export const CONVERGE_MAX_RUNS_PER_HEAD = 8;
// A required check with no run at all on the head after this grace period was
// never triggered (observed 2026-10-22 on #5672: token-created recovery PR,
// no `test` or gate run ever started; the hand-off chain idled to its cap).
export const CONVERGE_MISSING_GRACE_MS = 2 * 60 * 1000;

const PASSING = new Set(['success', 'neutral', 'skipped']);

export function isStuckCheckRun(run, workflowRun, nowMs, stuckMs = CONVERGE_STUCK_MS) {
  if (!run || run.status === 'completed') return false;
  // A completed suite is not evidence that this exact check run has stalled:
  // multiple GitHub check suites / dispatches can overlap on one head SHA.
  // Never duplicate healthy, short-running CI merely because its lookup
  // resolved an older completed workflow. Require measured check age first.
  const started = Date.parse(String(run.started_at || ''));
  return Number.isFinite(started) && Number.isFinite(nowMs) &&
    nowMs - started > stuckMs;
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

export function missingRequiredChecks(required, checkRuns) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  return required.filter(name => !runs.some(run => run?.name === name && run?.app?.slug === 'github-actions'));
}

export function requiredChecksToHeal(required, checkRuns, workflowRunBySuite, nowMs, waitedMs, { stuckMs = CONVERGE_STUCK_MS, missingGraceMs = CONVERGE_MISSING_GRACE_MS } = {}) {
  const stuck = stuckRequiredChecks(required, checkRuns, workflowRunBySuite, nowMs, stuckMs);
  const missing = waitedMs >= missingGraceMs ? missingRequiredChecks(required, checkRuns) : [];
  return { stuck, missing, heal: [...new Set([...stuck, ...missing])] };
}
