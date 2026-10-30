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

## Same-job quota circuit for legacy required statuses

A second scoped safety measure in `scripts/github-status-transient.sh` prevents unnecessary repeated GitHub REST status calls after **this exact GitHub Actions job** has already observed a verified primary/secondary quota error. The on-runner `RUNNER_TEMP` marker is keyed by run ID + attempt + job name, and contains no credentials or response body. On any subsequent call in that job the helper exits with code 22, leaving required checks blocked. Every job/attempt continues to require its own genuine GitHub response and authenticated required statuses; no fabricated success or release authorization is possible.

The circuit only activates on HTTP 429, or HTTP 403 with measured `x-ratelimit-remaining: 0` or an explicit rate-limit response message. Permission-only 403, authentication 401, invalid 422 and transient 5xx retain their existing behavior. In particular, this does not refresh the budget or retry after its reset, and must not be used as an excuse to skip status publishing. Synthetic tests cover same-job repeated 403/429 and distinguish unrelated permission denials. The official GitHub App signed webhook / D1 shared admission / protected release are separate work items.

## GitHub Actions quota diagnostics without more API requests (2026-10-31)

The existing `scripts/github-status-transient.sh` now writes one bounded, credential-free line into `GITHUB_STEP_SUMMARY` **only after** a failed request or a same-job quota-circuit suppression. Fixed labels distinguish:
- `quota_primary`: HTTP 403 with authoritative `x-ratelimit-remaining: 0`.
- `quota_secondary`: HTTP 403 whose body explicitly contains a rate-limit indication but no measured zero.
- `rate_limited_429`: HTTP 429, not silently recast as primary quota exhaustion.
- `permission_denied`: HTTP 403 without rate-limit evidence (auth/permission).
- `authentication_denied`, `validation_denied`, `transient_exhausted`, `transport_error`, and `quota_circuit_suppressed`.

Each note exposes only the fixed label, a verified numeric HTTP status, bounded 0–2 transient retry count, and an explicit statement that required CI checks remain blocked. It never includes a GitHub URL, token, request headers/body, actor, repository secret or fabricated remaining quota. It adds **zero GitHub HTTP requests**, cannot mutate a required check, and only writes to the GitHub-provided local job summary file when `GITHUB_ACTIONS=true`.

Fail-closed remains mandatory: do not merge or auto-rerun on quota outages. Diagnose the CF-QUOTA-001 Cloudflare 429 failures independently from GitHub API rate limits. Run `node --test test/github-status-transient-retry.test.mjs` as part of the protected CI suite.
