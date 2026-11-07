# EKODI Points — production backup proof and schema checksum plan

**Status: inspection-only implementation, not an approved migration or deployment.**

Task `points-prod-backup-plan-20261104`; parent issue #7778. All 21 Supreme Attributes remain mandatory, especially Security, Reversibility, Data Sovereignty, Verifiability and Human Sovereignty.

## Operation

- Source-controlled `scripts/points-production-backup-plan.mjs` reads the 20 known EKODI points migration SQL files, computes separate SHA-256 digests and a deterministic overall manifest hash, and notes trigger/constraint replacement and SECURITY DEFINER areas needing review.
- The tool reuses `verify-points-release-readiness.mjs` to inspect the fixed production Supabase project and calls only the official `GET /v1/projects/{ref}/database/backups` Management API endpoint.
- `backup.inventory_status=recent_backup_visible` means a COMPLETED backup within 48 hours, or a recent PITR physical checkpoint with PITR actually enabled; it **does not** mean the backup has been restored successfully. `restore_test_verified=false` is always returned.
- `production_schema_write_authorized=false` and `production_points_activation_authorized=false` are invariant: no schema/ledger/API function changes or point earning, spending, transfer, donations or tiers are activated.
- The manual-only `.github/workflows/verify-points-production-backup-plan.yml` runs from exact current `main`, uses the existing GitHub `production` environment credential, and writes neither backups nor databases. Use the `expected_main_sha` of the actual current main. `require_recent_backup=true` makes an old/absent backup inventory fail the run.

## Release policy

1. Independently verify a real **restoration** process or formally approved PITR recovery runbook, not just the existence of backups. Establish recovery point and retention expectations with the data owner. An unverified restoration is an explicit human security gate.
2. Require a different, source-pinned, protected database promotion workflow with a matching EKODI Orchestrator receipt and production environment approval. Migration history must remain consistent with the Supabase-managed ledger; no ad-hoc production query or manual ledger rewrite.
3. The production schema is currently absent, even though the canonical Person, login identities and tenant dependencies exist. Preserve `POINTS_ENABLED=false`, and keep all rules, donations and transfer decisions off until audited economic and site policies are approved.
4. Deploy `points-api` with JWT verification only after versioned schema and RLS checks. Verify anonymous 401, canonical Person-scoped permission, protected audit/ledger, staged synthetic member E2E and real production canary before any user announcement.

## Exact execution

From GitHub Actions on `main`: choose **Verify EKODI Points Production Backup and Schema Plan**, enter the latest `main` SHA, select `require_recent_backup=false` for an inventory report. Choose `true` to fail on absent recent evidence. No user credentials or backup identifiers are printed.

Result should be recorded on #7778 with the GitHub run link, exact SHA, backup inventory classification, all 20 source digests, known security-review flags and remaining human gates.

## 2026-11-07 production Free-plan backup gate — verified blocker, no data exported

**Read-only evidence / 2026-11-07 (Asia/Seoul):**

- The Supabase organization `에코디플랫폼` was verified via the connected Supabase organization API as `free`. Official Supabase documentation states that Free projects do **not** get automatic daily backups; the CLI `supabase db dump` or `pg_dump` is the documented manual logical-backup option. References: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore .
- Production readiness run [42363845134](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42363845134), actual inspect job `128377655705`: identity prerequisites true, `points_not_installed`, **0/20 migrations**, no production `points-api`, activation forbidden.
- Production backup plan run [42363846607](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42363846607), actual inspect job `128377670041`: `recent_completed_backups=0`, `pitr_enabled=false`, `missing_or_stale_backup`. The protected job failed as designed. This is **not** proof that somebody has already made an encrypted, restorable manual export.
- Staging browser run [42321120999](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/42321120999) succeeded on member claim and admin points flows for desktop/mobile; it is **not** a production backup or a production points activation receipt.

### Secure free-plan route (design only; human-controlled data export)

1. **Authorize** the exact production data scope, approved encrypted offsite destination, encryption key custodian, minimum-necessary backup operator, access logging, retention and deletion timeline. Do not upload an unencrypted database dump to GitHub, Actions artifacts, issues, chat, public buckets or model workspaces. Do not put a production database password in source code, job logs or a developer worktree.
2. **Take a manual logical backup through an owner-approved protected execution environment**, using a least-privilege database connection and supported CLI/pg_dump procedures. Capture roles, schema and data as required for a coherent restoration; verify compatibility with project extensions and linked Auth/identity tables. Supabase database dumps do not automatically contain the Storage API's object bytes; assess Storage recovery separately.
3. **Attest and protect** encrypted backup output, hash/size, verified completion time, source project identity, approved storage pointer, expiration/retention and operator audit (no plaintext identifiers, secrets or raw user data in public evidence). A hash alone does not establish recoverability.
4. **Restore rehearsal** only inside a permitted isolated target (never overwrite production), using an approved restoration owner. Check data integrity, required tables/functions/permissions, canonical Person identity, migration consistency and application-critical row counts. Keep evidence private and issue only a minimal pass/fail receipt to the Orchestrator.
5. **Promote only on explicit authorization**: a protected schema-promotion lane may check that the manual backup-and-restore receipt is current, binds to the exact production source and has independent human security approval. Existing `verify-points-production-backup-plan.yml` checks only **Supabase-managed** backup inventory; it cannot attest a manual logical backup. A new verified manual-receipt gate must be separately reviewed, implemented and tested before any workflow treats this route as acceptable.
6. Until then, preserve all deny-by-default controls: `POINTS_ENABLED=false`, no production points schema write or `points-api`, no spendable balance, member transfer, donation, cash value or auto-award. Neither a documentation PR nor a backup file alone authorizes economic activity.

**Approval boundary:** The cost-free logical-backup approach is recommended for the existing Free plan, but *production data export, storage destination, credential delegation, and recovery exercise require the data owner's explicit security/privacy authorization*. A paid Pro upgrade is an alternative and likewise requires owner payment authorization. This checkpoint intentionally runs no database mutation, export, credential inspection or backup restoration.

## Approved follow-up: protected manual proof verifier

2026-11-07: the owner approved proceeding with the existing EKODI Shared Drive backup target and an encrypted, privately restored production logical backup. The read-only target inventory confirmed `99_BACKUP/SUPABASE_PROD/{ENCRYPTED_DUMPS,MANIFESTS,RESTORE_EVIDENCE}` exists, but all three subfolders remain empty and the inherited sharing audience was not verified. The protected operator must not export/upload actual customer data until those permissions and encryption-key custody are checked. See [`points-manual-backup-owner-protected-20261107.md`](./points-manual-backup-owner-protected-20261107.md) for the source-controlled non-activation workflow and two-signer proof contract. Neither this checkpoint nor the new verifier replaces an actual compatible export, independent restore, human security approval, or the protected migration lane.
