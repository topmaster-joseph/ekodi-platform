# SeonamMedi Citizen Voices V3 Google handoff — protected release checkpoint (2026-10-17)

## Approved implementation and source
- Source PR #5177: exactly approved functional SHA `248e2ed7bc8f278e9554dd94b606523320038928`.
- GitHub owner approval marker: https://github.com/topmaster-joseph/ekodi-platform/pull/5177#issuecomment-6233602684
- Owner-approved `orchestrator-human-gate-approved` label on source PR.
- Official EKODI orchestrator recovered PR #5183, task `orch_recovery_248e2ed7bc8f278e9554dd94b6065233`.
- The recovered branch is behind current protected main and bot-created check runs returned `action_required`.

## Owner-authored CI/provenance checkpoint only
This document-only commit is intended to request authentic CI on the official recovery branch and first-party protected update-branch convergence. It does **not** alter authentication code, Google consent, authorization, session handling, any worker, queue, D1 database, site routes, migration, secrets, or deployment workflow. Preserve the exact approved functional source SHA as ancestor and never waive the Human Gate or replace a newer main file without explicit conflict reconciliation.

## Required acceptance gates
1. Synchronize with latest main using only EKODI's existing first-party protected convergent merge mechanism. Inspect concurrent Independent Board and SeonamMedi Site Core changes.
2. Pass real GitHub Actions full CI, security, constitution, provenance, and parallel-conflict checks on current resulting PR HEAD; an `action_required` check is not success.
3. Protected merge only through the official EKODI orchestrator, followed by the guarded Independent Board release with deployment receipt, staging/production health and automatic rollback safeguards.
4. Verify both `https://seonammedi.kr/board/voices?compose=1` and `https://ekodi.kr/seonammedi/board/voices?compose=1` on desktop and mobile. Test existing session, fresh Google account selection, return intent, failed/cancelled handoff without loop, actual queue-published writing and listing, admin modification/deletion, and unauthorized 401/403.
5. Never claim actual signed-in write/admin success from anonymous tests, synthetic sessions, HTML snapshots, or green CI alone. Record real Google authenticated E2E evidence separately.

No legacy citizen records or unrelated notices, schedules, finance, church, or other tenant data may be deleted or changed by this PR. Production is **not** complete until the real service and signed-in workflows are verified.
