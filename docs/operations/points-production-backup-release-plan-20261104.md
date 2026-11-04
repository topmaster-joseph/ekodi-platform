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
