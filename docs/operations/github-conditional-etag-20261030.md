# EKODI Orchestrator GitHub conditional GET budget optimization (#6630)

Status: **source-only candidate**. No GitHub credentials, app installation, production D1, protected main, deploy, or CI gate settings changed.

## Incident and distinction

- On 2026-10-30, Insurance candidates PR #6925 and #6621 logged `Full test suite: PASS` but the status-publication stage returned authenticated HTTP 403 `primary_rate_limit`, `remaining=0`, `limit=5000`. Their overall CI remains failed and must not be called green.
- A valid GitHub REST `304 Not Modified` on an **authorized conditional GET** avoids primary rate-limit consumption under GitHub's documented behavior. It does **not** grant capacity to write commit statuses or merge PRs.
- Replacing final required statuses with cached values, weakening branch protection, or invoking alternate credentials to evade a live limit is forbidden.

## Scoped optimization

The existing `createGitHubBudgetClient` now retains a per-client, per-route validated 2xx JSON result and the associated bounded `ETag` (no cross-run persistence). On the next same-route GET after optional short TTL expires, the client sends `If-None-Match`. A 304 may reuse **only this exact previously authenticated successful response**. A 304 without such evidence throws. No mutation, POST, or foreign route is conditionally cached.

Authentication, measured budget headers, rate-limit stop timing, permission rejection, fail-closed status recovery and genuine run evidence remain unchanged. The optimization targets repeated status reads inside one process, including required head-status polling. It neither submits nor simulates any required status.

## Limits and production release

- The biggest reduction comes from fewer polls by converting orchestrator to signed GitHub Webhooks, a durable D1 dedupe queue and a properly provisioned EKODI GitHub App installation. Existing #6630 features include base instrumentation and a separately gated shared admission candidate PR #6995.
- A typical user token has a combined budget and the Actions `GITHUB_TOKEN` has its own per-repository budget. More user accounts/PAT rotation must not be used as an unauthorized bypass.
- The current signed webhook + App installation activation remains unverified: installation identity, HMAC signing secret, receipt-proof authentication, D1 migration, owner approval, actual hosted traffic, concurrency and rollback need inspection.
- Required verification: `node --test test/github-api-budget-guard.test.mjs`, full mandatory checks at the exact candidate SHA, official EKODI Orchestrator issued `orch_` release, protected merge, staging, production observability of 304 rates and rate-limit events.

References:
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
