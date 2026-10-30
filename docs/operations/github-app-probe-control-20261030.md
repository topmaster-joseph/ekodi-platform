# EKODI GitHub App read-only canary control · 2026-10-30

Parent: issue #6630 · Authority: EKODI Orchestrator

## Purpose

Connect the previously protected-merged `github-app-readonly-probe.js` to a **super-admin-only, manually confirmed Control API path**, without granting source mutation or deployment control and without requiring new paid external automation.

- `POST https://ekodi.kr/api/control/ai/v8/github/readonly-probe`: accepts precisely `{"confirm":"readonly_quota_probe"}`. Existing authenticated Central Admin session must be platform `super_admin` with `ai:operate`; origin must be exactly the same origin as the Control API, and content type must be JSON. No caller-supplied GitHub path, token, App/installation ID, repository, permissions, quota or command.
- `GET .../github` retains existing `ai:read` and returns a **redacted** `probe` readiness/read-model (enabled, configured, latest claim/result, observed request count), not credentials.
- `/admin/control` GitHub panel receives an initially disabled, explicit confirmation button `GitHub App 실측(읽기 전용)`. It is enabled only when server readiness says credentials and flag are provisioned; no hidden polling.
- `migrations/202610302200_github_app_probe_attempts.sql` is an **additive** audit table with only installation ID, six-hour slot key, status, fixed safe reason, measured request count (0–2), claim and finish times. No private key, JWT, installation token or bearer header.
- The source-gated `INSERT OR IGNORE` is atomic with unique slot key: at most one GitHub App installation token mint attempt per configured installation per **6-hour slot** across simultaneous Control Worker instances. Denial, network errors and crash also consume the slot to prevent quota storms. A new attempt can occur only in a later slot, never by repeating a POST.
- With unset `EKODI_GITHUB_READONLY_PROBE_ENABLED` or absent owner secrets the code performs **zero GitHub requests** and does not claim a D1 slot.
- Success means one metadata-only App token exchange and one authenticated, canonical `GET /repos/topmaster-joseph/ekodi-platform`, followed by measured GitHub core budget observation into D1. The existing admission flag remains OFF and there is no webhook mutation or PR release authority.

## Guarded rollout

1. Exact-head CI, security, constitution and EKODI Orchestrator receipt.
2. Protected PR merge and Control API staged migration/test. Fail closed if the additive migration is not live; verify encrypted D1 snapshot / recovery bookmark before production migration.
3. Owner creates EKODI-owned dedicated GitHub App and installs it in the expected repository with a minimal metadata-only permission; separately provisions server-side App ID, installation ID and private PKCS#8 key. **Never paste a private key into a chat, git commit, D1 or frontend.**
4. Enable `EKODI_GITHUB_READONLY_PROBE_ENABLED=true` **only after** the app is authorized, staged and the exact on-server credentials reviewed. The UI action must be a deliberate super-admin action; it does not auto-run on cron.
5. Confirm authorization failures, bad Origin, missing JSON confirmation, absent schema, simultaneous clicks and D1 observation freshness without token leakage. Observe real GitHub headers and the 2-request cap after a single authorized staging canary.
6. Guarded production promotion, exact live /admin/control session and D1 evidence, then clean rollback: disable read-only flag and remove/rotate the signing key; never disable branch protection or turn on shared budget admission without a separate verified complete caller rollout.

## Important limitations

This is **a deliberately bounded read-only observation bridge, not the live issuer for all GitHub operation clients.** Shared-budget enforcement, signed webhook event reception and mutation clients remain separately gated. A successful CI run or D1 schema deployment is not evidence that the real app was installed, that API quota was recovered, or that any GitHub API client is admitted.

Test: `node --test test/github-app-probe-control.test.mjs test/github-app-readonly-probe.test.mjs`.
