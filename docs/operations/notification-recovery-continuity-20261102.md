# Notification Core — protected EKODI recovery convergence

Date: 2026-11-02 (Asia/Seoul)

## Verified immutable source

- Original authoring PR: #7404; initial release-provenance recovery was refused because its base was stale and the recovery integration lacks GitHub workflows permission.
- Updated source PR: #7555 (closed as superseded; **not merged**).
- Updated source head: `1d49934a53260643ace3e719ab728b2b746db01f` from `ai/chatgpt/notification-core-reissue-20261102`.
- Exact source base: `main@0fd60908a6057c2581340fc340f39914dfc9b533`.
- First-party Orchestrator task: `orch_recovery_1d49934a53260643ace3e719ab728b2b`.
- Official recovery PR: #7557; branch `ai/chatgpt/orch_recovery_1d49934a53260643ace3e719ab728b2b`.

## Why this documentation-only continuation exists

The first-party Orchestrator created its trusted recovery PR, but recorded `authentic_required_checks_not_green`. A GitHub Actions-created branch can leave pull_request checks in `action_required` rather than authenticated successes. This non-runtime documentation commit, authored through the owner-connected repository, requests authentic checks on the *existing official recovery branch*, and triggers its existing `EKODI Orchestrated PR Convergent Merge` push workflow. It does **not** issue or fabricate a release receipt, change deployment authority, alter protected branch rules, or merge a task PR.

The exact functional source remains an ancestor of the recovery branch. Source-level verification already ran successfully before reissue: notification tests 6/6, additive D1 migration guard 220, service-layer boundary validation, entire build, and source diff check. Protected current-head CI, update-branch conflict checks, source-ancestor validation, server-authoritative receipt and guarded production deployment remain required; no result is assumed.

## Production safety and acceptance

- Keep `NOTIFICATIONS_SEND_ENABLED` disabled by default. Do not generate or insert production VAPID private keys or event secrets from a client or this branch.
- Before enabling sending, run staged D1 migration `migrations/202611020100_notification_core.sql`; confirm public page `/notifications/` and `GET /api/notifications/config` return correct assets/contracts.
- Validate opt-in, unsubscribe, topic changes, rejected origins, expired endpoints, retries, and real Android/desktop/iOS Home Screen Web Push with the proper server-side secrets.
- Publishing events from Church and Mission are not wired in the first increment; integrate only through their authorized server-side event producers after a separate review and opt-in check.
- Any claim of live delivery requires the merged official release SHA, guarded deployment and confirmed device receipt. A 200 page response that is actually a catch-all fallback is **not** proof that the notification page deployed.

This file is a continuity receipt, not implementation code or deployment authorization.
