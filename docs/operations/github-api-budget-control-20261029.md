# EKODI GitHub API quota incident — P0 implementation (2026-10-29)

Owner task: issue #6630. Church C3 PR #6560 is an affected release, **not** proof that the old domain was retired.

## Boundaries
- Protected exact-head CI, EKODI AI Orchestration Gate, branch protection, and owner production gates remain mandatory. A rate-limit HTTP 403/429 **cannot** become a successful check.
- New `scripts/github-api-budget-guard.mjs` parses primary/secondary limits and Retry-After/x-ratelimit-reset, reserves 5 requests, prevents in-process bursts during lockout and coalesces concurrent identical read operations. Ordinary 403 permission denials remain failures.
- `recover-required-status-drift.mjs` consumes the guard, reduces status polling from 3 seconds to 7.5 seconds and avoids re-publishing already identical, verified status evidence for the same merge SHA. Moving merge SHA and missing/failed authentic head evidence still fail closed.
- This is **process-local** circuit protection. It is not yet a durable installation-wide queue, cannot reserve quotas among parallel GitHub jobs, and does not constitute deployment of `/admin/control` dashboard. Do not claim those exist.

## Next protected scope (P1 and P2)
1. Sign and replay-protect GitHub Webhook intake in EKODI Cloud; prefer event delivery over polling. Key jobs by repository, task ID, head SHA and operation, with idempotency and durable D1/Postgres queue.
2. Central single-owner worker: per-installation API budget from response headers, exponential backoff respecting `Retry-After`, bounded work leases, priority to production incidents. GitHub writes use task-specific permissions; never share arbitrary user tokens.
3. `/admin/control` protected view: pending, running, exhausted, retryAfter, attempts, duplicate suppression and authorization receipts. Token values must never be shown or logged.
4. Do not move GitHub required checks or protected merge decisions to an unauthenticated external signal. Complete protected review, staging and production canaries before declaring deployment complete.

## Evidence / verification
- `node --test test/github-api-budget-guard.test.mjs test/recover-required-status-drift.test.mjs`
- Inspect guarded workflow results for the exact new PR head. In production compare 403 volume, Github API requests per task, duplicate workflow runs and protected merge success before/after.
- For Church C3, separately prove canonical public/member pages, zero legacy Pages/Worker/DNS binding and independent legacy hostname non-service.

## Official recovery PR exact-head verification

EKODI Orchestrator automatically created recovery PR #6635 with a GitHub Actions bot-authored head. The repository owner requests authentic required checks for the newest exact head in the protected recovery branch. This documentation-only update is not evidence of deployment, not a substitute for required CI, and cannot authorize production operations. Preserve the underlying quota guard, tests and release provenance unchanged.
