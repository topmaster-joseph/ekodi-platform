# EKODI native background browser proof — guarded release verification

## Immutable owner-approved provenance
- Original issue #5150, owner-authored source PR #5151.
- Human-approved exact executable SHA: `c83d956a6e99ebb917b87dd5da951e9e5791d7b2`.
- Exact owner approval marker recorded before approval label: https://github.com/topmaster-joseph/ekodi-platform/pull/5151#issuecomment-6233433695
- Official EKODI Orchestrator D1 task: `orch_recovery_c83d956a6e99ebb917b87dd5da951e9e`.
- Canonical orchestrated recovery PR #5172, branch `ai/chatgpt/orch_recovery_c83d956a6e99ebb917b87dd5da951e9e`.

## Owner-authored protected check restoration
Bot-created recovery-branch PR checks were marked `action_required` and did not execute. This documentation-only owner commit requests genuine required GitHub CI and protected release validation on the recovery head, **not** the previously tested source SHA. It changes no runtime code, device state, credentials, database records, user browser tabs or governance settings. Do not treat this documentation update as a new Human Gate approval or permission to bypass protected convergence.

## Exact implementation and guardrails
- `background-browser-proof.js` enforces actual, authenticated device-scoped native browser completion receipts, verifies no user tab/focus theft/profile reuse, read-only browser proof, owned process/profile/screenshot cleanup and strict terminal `AUTH_REQUIRED`.
- `device-control.js` and `hybrid-execution.js` both invoke the same gate for native browser completion. A bare agent `success:true` is insufficient.
- The production Control API route owner is `mission-control-entry-worker.js`. Preserve authenticated routes, input constraints, agent capabilities, no destructive retry, rollback and staging-first promotion.
- Related open PRs touching Device Control/Windows Browser code require independent parallel conflict inspection. No direct main push or forced merge.

## Required completion
Verify fresh exact-recovery-head Constitution, AI orchestration, CI, Windows CI, distributed runtime, dependency security, parallel conflict and Control API staging checks. The official EKODI Orchestrator must synchronize protected main and merge only after all guards pass. Apply only receipt-bound guarded Control API production deployment and independent rollback verification, then verify USER2/USER3/USER4 live enrolled heartbeat, first-party BG Browser Canary, headless task and actual zero-user-tab/focus/clipboard receipt.

Proof from a GitHub-hosted Windows runner is **not** proof from user's three PCs. Offline/revoked/unverified devices remain deferred and unsafe background execution must remain blocked. Do not claim deployment or PC acceptance without verified live receipts.
