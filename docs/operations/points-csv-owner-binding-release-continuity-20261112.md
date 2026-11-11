# EKODI Activity Points — authenticated member CSV owner binding protected release continuity

Date: 2026-11-12 (Asia/Seoul)
Official recovery PR: #9376
Exact functional source PR: #9375, immutable source commit `1304439e0b26c1c6da2141a4667add989cc7865e`
Orchestrator branch: `ai/chatgpt/orch_recovery_1304439e0b26c1c6da2141a4667add98`
Current synchronized official head at checkpoint: `674471f1195074c6cc2de44e4fc1995840dcd271`

## Why this is an authenticated validation request

The first-party EKODI Orchestrator created recovery #9376, carrying the source functional changes and their tests. Its synthetic GitHub-Actions-origin PR runs for the synchronized head show `action_required` rather than executed CI. The source branch's real CI run [43121852829](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43121852829) passed, and My EKODI validate/staging run [43121852842](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43121852842) passed. Those are **not** substitutes for authentic required checks on the latest official head.

This documentation-only update through the connected repository identity is an ordinary non-runtime change on the **existing Orchestrator-issued recovery branch**, intended to trigger its normal authenticated CI and first-party convergent merge workflow. No labels, special privileges, branch protection, checks or release receipts are forged or bypassed. The original source functional SHA must remain an ancestor, and the first-party Orchestrator retains sole merge/production-promotion authority.

## Changed feature and security claims

- The member's server-fetched recent CSV history snapshot binds to the authenticated `session.user.id` that initiated the fetch, in addition to selected site and view revision. Download uses fresh Supabase auth session and fails closed if the user/account changed or the token is absent.
- The member script reference uses `/my/points/app.js?v=20261112-csv-owner-binding-v2`; old versioned scripts are not relied on after a guarded release.
- The existing My Worker release manifest checks the new script and version markers on both candidate and canonical Points public assets; rollback accepts the previous safe (non-owner-binding) release, without silently accepting failed new canaries.
- No points awards, financial transactions, database migrations, auth service modifications, membership rights, secret values, permissions, source policies or paid API settings are changed.
- Exact-source tests include rejection when a silent account transition leaves the previous site/revision untouched.

## Required first-party completion evidence

1. Authentic `test`, `EKODI AI Orchestration Gate` and all repository-required security/Constitution/Supabase/Cloudflare conflict checks must pass on the final **official recovery head**, not just on #9375.
2. Protected convergence verifies source ancestry, new-main compatibility, and the original Orchestrator receipt before merge. No worker direct merge.
3. After main merge, guarded My Worker candidate/production deployment must verify actual `https://ekodi.kr/my/points/` and `/my/points/app.js` with owner-binding/cache markers. Verify 100% promotion and live route receipt. If it fails, retain/restore the prior safe release and correct via a new isolated task PR.
4. The live public static canary does not certify authenticated member CSV download. A synthetic authorized member desktop/mobile browser E2E on isolated development remains the next distinct proof.

## Economic activation and backup boundaries

Production `POINTS_ENABLED=false`, no production points tables/ledger or `points-api`. Connected read-only EKODI Shared Drive inspection confirms `99_BACKUP/SUPABASE_PROD/{ENCRYPTED_DUMPS,MANIFESTS,RESTORE_EVIDENCE}` all exist, but each had **zero direct files** at the inspection. Inherited shared-drive membership visibility was **not verified**, so the storage directory alone cannot authorize a backup export.

Development rules `rule_id='active' AND enabled` and adapters `adapter='devotion_self_report' AND enabled` both currently count zero, but security migration `20261108224500_ekodi_points_nonverified_reward_guard.sql` is unapplied: its protective database constraints remain absent. This must be addressed only in an independently approved protected DEVELOPMENT migration path.

Neither this note nor a code merge provides an encrypted usable backup, independently tested restore, human finance/security approval, a production points migration, member points economic activation, or a signed-in member export E2E result. All such gates remain deny-by-default.
