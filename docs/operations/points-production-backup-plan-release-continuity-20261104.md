# EKODI Points backup plan — official release continuity
Date: 2026-11-04 (Asia/Seoul); Issue #7778.

## Verified authority
- Source task `points-prod-backup-plan-fix-20261104`, worker PR #8075, functional source SHA `2c9215ee7ec84f2bc727d42fb7ac765fc326e782`.
- Official EKODI Orchestrator recovery PR #8076, branch `ai/chatgpt/orch_recovery_2c9215ee7ec84f2bc727d42fb7ac765f`.
- Older source #8073 and obsolete recovery #8074 were closed after a test-only false positive: fixture ID regex `/999/` matched SHA-256 digits. The corrected source matches only the backup ID field.
- The correct worker source SHA passed authentic CI, Supabase Local CI, AI Orchestration Gate; the older source's failed CI is not release authority.
- The official recovery branch preserved the corrected functional ancestor, contains current main, and its regenerated bot-origin checks were `action_required`, not authenticated checks.
- This documentation-only commit on that **existing official recovery branch** requests normal owner-connected required CI on exact current head. It does not modify source code, credentials, checks, deployment authority, financial rules, production DB or any feature flag.

## Release acceptance
1. Authentic exact-latest-head CI, Supabase Local CI, security and constitutional checks pass; orchestrator validates its own signed receipt and protected merge.
2. Canonical protected `main` includes the read-only backup plan script and manual-only workflow; no production writes occurred.
3. Run `verify-points-production-backup-plan.yml` from an exact current main SHA, in existing GitHub production environment; report recent-backup/PITR inventory as distinct from restore proof.
4. A recent listed backup is NOT proof of successful restoration; no production migration may be applied without independently authorized recovery procedure, owner/security gate, and a distinct protected migration lane.
5. No points, transfers, donations or site rules are activated; `POINTS_ENABLED=false` remains, and production has no points schema or points-api until separately approved.

## Latest-main authenticated continuation (2026-11-04)
Owner-connected release HEAD `115fb3d61a855837ab557e4b0490aeb9e29a05c8` completed authentic CI, Supabase Local CI and EKODI AI Orchestration Gate successfully.
After concurrent platform changes, the EKODI Orchestrator synchronized current main to bot recovery HEAD `f9eef1d18dcad8c8b51cac8ecdd84c2689d39ba3` while preserving the original functional ancestor and staying zero commits behind main. Its `action_required` statuses are parked GitHub approval records, not authentic test results.
This documentation-only continuation requests normal protected CI on the latest official recovery HEAD. Nothing executable, financial, privileged, production-facing or credential-bearing is altered.
