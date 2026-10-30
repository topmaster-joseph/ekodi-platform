// Classify GitHub API refusals seen by release-provenance recovery so a refusal
// is either retried safely (quota) or recorded with the exact remedy (stale base).
//
// Observed 2026-10-30 (D1 ekodi_orchestrator_tasks.dead_letter_reason):
//  - 03:3x UTC: 15+ recoveries failed "failed to inspect existing recovery branch:
//    HTTP 403" while the primary rate limit was exhausted. Nothing retried them.
//  - PR #6998 @03dd22b re-run: "failed to create recovery branch: HTTP 403 Resource
//    not accessible by integration". The source was cut from a main whose
//    .github/workflows have since changed; creating a ref at that commit counts
//    as a workflow change and the recovery token has no `workflows` permission.
import { inspectGitHubBudget } from '../github-api-budget-guard.mjs';

export const RECOVERY_RATE_WAIT_CAP_MS = 4 * 60 * 1000;

/** Rate-limit decision for one response: wait (bounded) and retry, or give up with a reason. */
export function rateLimitDecision({ status, headers, body, nowMs = Date.now(), capMs = RECOVERY_RATE_WAIT_CAP_MS }) {
  const budget = inspectGitHubBudget({ status, headers, body, nowMs });
  if (!budget.limited) return { limited: false };
  const waitMs = Math.max(0, budget.until - nowMs);
  return {
    limited: true,
    reason: budget.reason,
    retryAt: budget.until,
    waitMs,
    retry: waitMs <= capMs,
  };
}

const INTEGRATION_FORBIDDEN = /resource not accessible by integration/i;

/** True when a ref creation was refused for missing token scope rather than quota. */
export function isIntegrationScopeRefusal(status, body) {
  return status === 403 && INTEGRATION_FORBIDDEN.test(String(body?.message || ''));
}

/**
 * Given the compare payload base=<source sha> head=main, list workflow files main
 * changed since the source was cut. Non-empty means the source must be re-issued
 * on current main: the recovery token can never create a ref at the stale commit.
 */
export function staleWorkflowFiles(compare) {
  const files = Array.isArray(compare?.files) ? compare.files : [];
  return files
    .map(file => String(file?.filename || ''))
    .filter(name => name.startsWith('.github/workflows/'))
    .slice(0, 20);
}

export function staleBaseRemedy({ prNumber, headSha, files }) {
  const list = files.slice(0, 5).map(name => '`' + name + '`').join(', ');
  return 'recovery branch refused (HTTP 403 Resource not accessible by integration): source ' +
    String(headSha).slice(0, 12) + ' of #' + prNumber + ' is based on an older main whose ' +
    '.github/workflows changed since (' + (list || 'workflow files') + '); the recovery token has ' +
    'no workflows permission. Re-issue the same change on current main (new ai/<agent>/<task> branch).';
}
