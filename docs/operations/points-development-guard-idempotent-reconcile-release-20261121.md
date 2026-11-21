# Points DEVELOPMENT guard: owner-approved rerun safety and Orchestrator recovery

Date: 2026-11-21 KST. Central issues #7778 and #6739. Source worker PR #10023; first-party EKODI Orchestrator official recovery PR #10024. Original functional source commit `70130fb4adffa8f6389c949e34ac973abb3bcc76`.

## Confirmed live-state problem
The original protected owner-only workflow from #9936 expected exactly 20 Points migration receipts, no new CHECK constraint, and no final migration receipt. The existing previously approved DEV-only guard was **directly applied** under user owner instruction on 2026-11-21 (recorded in #7778, not via the GitHub Actions workflow). The subsequent old workflow, if triggered, would refuse the legitimate completed state and inaccurately report failure.

Actual 2026-11-21 DEV read-only query on project `lxcxwbdwwojjkgybbqii`: both validated canonical anti-unverified-award CHECK constraints present, 21st migration `20261108224500` recorded, old 20 migration receipts intact, no economic ledger rows or wallet balance, no enabled low-trust heartbeat or self-reported devotion rewards, no E2E fixture sites. The updated exact read-only preflight query from this source patch returned all shared prerequisites true and `guard_not_recorded=false, guard_recorded=true, no_partial_guard=false, guards_verified=true`. This is the only permitted `already_applied` state.

## Scope of the source patch
- The `scripts/sql/points-nonverified-development-preflight.sql` now counts exactly the prior 20 receipts without double-counting the 21st receipt. It separately checks two canonical, validated, real PostgreSQL CHECK expressions, both under the correct table, and the exact matching final migration receipt.
- The pure `scripts/classify-points-development-guard-preflight.mjs` only permits two unambiguous states: `fresh` (both guards and receipt fully absent) or `already_applied` (both exact validated guards and receipt fully present); malformed payloads, partial, drifted, low-trust rewards or nonzero economic ledger fail closed.
- The owner-only, `workflow_dispatch`-only protected `development` workflow *skips mutation steps entirely* in the existing valid guard state, yet still performs independent read-only postflight. If genuinely fresh, original exact pinned additive SQL, Orchestrator release receipt, exact current main SHA, owner confirmation, development-only target, no retry and postflight safeguards remain compulsory.
- Source regressions in `test/points-development-guard-release.test.mjs` verify the two valid states and explicit refusal of partial/unsafe variants.

This official-branch **documentation-only** provenance record requests authentic CI on the first-party recovery head when bot-generated PR checks display `action_required`. It is not authorization to merge directly, relax required checks, run schema DDL, enable points, access secrets, create browser tabs or change production state. Wait for source-commit CI, exact official-head CI, official EKODI Orchestrator protected convergence.

## Remaining independent gates
- Latest actual staging browser E2E [44823992995](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44823992995) still fails closed on a **partial** GitHub `development` Cloudflare Access static identity (approved three secret fields must be bound together). Never substitute production token or broaden Access policies.
- Latest backup Shared Drive ACL [44719414084](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44719414084) fails closed because protected `production` does not expose approved `EKODI_STORAGE_GATEWAY_KEY`. Do not claim a real encrypted dump/isolated restore.
- PROD Points schema absent and `POINTS_ENABLED=false` is mandatory; real signed-in browser test and production backup/restore remain separate human-controlled security gates.

Code and protected merge are not substitutes for actual owner-authorized DB deployment (if any were still required), real browser E2E, backup/restore or financial approval. This patch performs no operational database mutation.
