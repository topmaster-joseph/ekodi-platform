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

// PARKED-RELEASE-VISIBILITY-001
//
// Measured 2026-11-10 in production D1: 46 recoveries refused for a stale base
// since 2026-10-27, still happening. The refusal was already written down twice —
// `ekodi_orchestrator_tasks.dead_letter_reason` and a PR comment — and read by
// nobody, because of how it was said:
//
//   #7993 collected SIX identical refusal comments between 14:31:52 and 14:45:25
//   on 2026-11-03 (one per pushed head) and then said nothing for eight days.
//   #8430 said it once and then nothing for five days. Neither PR carried a
//   label, so 46 parked releases could not be found as a set at all.
//
// Loudest in the fourteen minutes nobody was watching, silent for the week that
// mattered. By the time anyone looked, main had been rebuilt past both changes
// and the work was wasted — #7993's navigation model was replaced (its summary
// behaviour reversed) and #8430's finance layout was redone with stronger tests.
//
// So: keep exactly one notice, always naming the current head, and leave a label
// behind. The label makes the set findable; the single updated comment stops the
// one place it is said from becoming noise. Deduplicating per head sha would not
// have helped — those six comments were six different heads.
export const STALE_BASE_LABEL = 'release-blocked-stale-base';
export const STALE_BASE_MARKER = '<!-- EKODI-RELEASE-BLOCKED-STALE-BASE -->';

/**
 * Decide the single write that leaves one current refusal notice on the PR.
 * `comments` is the issue's comment list as GitHub returns it.
 * Returns { action: 'create' | 'update', commentId?, body }.
 */
export function staleBaseAnnouncement(comments, { headSha, remedy }) {
  const body = `${STALE_BASE_MARKER}\n` +
    `EKODI release-provenance recovery could not issue a release branch for \`${String(headSha).slice(0, 40)}\`.\n\n` +
    String(remedy);
  const list = Array.isArray(comments) ? comments : [];
  const prior = list.find(comment => String(comment?.body || '').includes(STALE_BASE_MARKER));
  const commentId = Number(prior?.id) || 0;
  return commentId ? { action: 'update', commentId, body } : { action: 'create', body };
}

export function staleBaseRemedy({ prNumber, headSha, files }) {
  const list = files.slice(0, 5).map(name => '`' + name + '`').join(', ');
  return 'recovery branch refused (HTTP 403 Resource not accessible by integration): source ' +
    String(headSha).slice(0, 12) + ' of #' + prNumber + ' is based on an older main whose ' +
    '.github/workflows changed since (' + (list || 'workflow files') + '); the recovery token has ' +
    'no workflows permission. Re-issue the same change on current main (new ai/<agent>/<task> branch).';
}
