# SeonamMedi Voices: official recovery CI and protected-main checkpoint

## Verified provenance
- Source PR #5111, owner-approved exact **functional** source commit `36e9eb60d3e9de7a247b4727ddb28739cd4578b9`; original Human Gate marker and label were registered by the repository owner.
- Official orchestrator recovery PR #5120, task `orch_recovery_36e9eb60d3e9de7a247b4727ddb28739`, branch `ai/chatgpt/orch_recovery_36e9eb60d3e9de7a247b4727ddb28739`.
- Prior official recovery returned `guarded-pending-http-412` because `latest_main_not_in_source_ancestry`; initial bot-created PR workflow runs were classified `action_required`.
- Parallel conflict review named #5120 as first integration winner, with `integration-order-approved` and `related-change-review-complete`; conflict rerun 38989394686 subsequently passed. Related calendar PR #5122 is deferred; duplicate source PR #5123 is draft.

## Owner-authored documentation-only CI continuation
This **documentation-only** checkpoint on the existing orchestrator-issued branch is intended to trigger **real, current-head GitHub Actions** and the already implemented `scripts/converge-orchestrated-pr-merge.mjs` update-branch path. It does not change code, credentials, tests, workflow permissions, database records, cloud configuration or release policy.

The original exactly approved functional SHA must remain an ancestor of any refreshed head. A new head's checks must actually run; `action_required`, fabricated statuses, skipped auth-positive CRUD or a queued check must never be reported as a pass. Existing EKODI receipt, required tests, conflict ordering, native protected branch update, merge and board dispatch are mandatory. Do **not** force-push, merge directly, grant unsanctioned approval, or bypass branch protection.

## Protect all user data and nearby changes
- Keep existing D1 `board_posts`, `board_replies` and R2 media unchanged; no migration, mass deletion, or production data rollback.
- Preserve newer main Site Core calendar script and public category loader; when latest-main synchronization produces overlapping modifications, stop and resolve visibly before merging. Calendar share #5122 is not approved by the #5111 marker.
- Maintain Google-only citizen writing and server permission-gated administrator edit/delete. Confirm reply/media display and updated stale-session selection after deployment.

## Required real completion proof
1. Verified native main ancestry update and protected checks on the actual final release HEAD, followed by official orchestrator guarded merge and independent-board deploy with rollback intact.
2. Both `https://seonammedi.kr/board/voices` and `https://ekodi.kr/seonammedi/board/voices`: guest list, Google account chooser, post-auth return to original compose URL, no login loop, D1 queued->published post in public list.
3. Authorized administrator modify/delete **only an isolated test post**, with normal user receiving 403 on admin APIs; verify PC and mobile actual browsers.
4. Uploaded images and replies visible, notice/finance routes unaffected, no private contact leaked in public HTML.

A successful worker health check, README-only commit, code CI, or unauthenticated 401 check **cannot** substitute for real signed-in post/admin tests.

## Native current-main convergence checkpoint
- Official convergent merge run [#38995328268](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38995328268) returned `action=branch-updated` and synchronized the current protected `main` into official PR #5120 at `c67e5c7ef48f54366d36401e4137dbe693ad2815`.
- The bot-generated synchronized head's workflows entered GitHub `action_required` without executing their checks. This document-only continuation requests actual owner-authored checks on the synchronized functional tree, then existing signed-receipt protected auto-merge. No functional code, configuration, roles, database or deployment workflow changed.
- Source Human Gate approval remains pinned to original functional ancestor `36e9eb60d3e9de7a247b4727ddb28739cd4578b9`. Revalidation of the actual synchronized head remains mandatory, and no release succeeds on this note alone.
