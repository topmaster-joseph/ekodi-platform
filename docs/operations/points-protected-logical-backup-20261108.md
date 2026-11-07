# EKODI Points: protected encrypted logical backup operator

Task: `points-protected-logical-backup-20261108`, parent #7778. 2026-11-08 KST.

**State:** a manual, production-environment-gated backup operator is prepared. **It has not been executed against production**; backup files and independent restore receipts are still absent. No production database credentials, recovery keys or PII are committed.

## Purpose and independent preconditions

Supabase Free does not include managed daily database backups. The official Supabase [platform recovery guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform) specifies three separately exported logical files for roles, schema and data, and warns that a database dump does not back up Storage objects, Edge Functions or external Auth configuration. The workflow therefore pins Supabase CLI **v2.122.1** with stable `--db-url` flags, rather than silently adopting the Nov 2026 v3 CLI flag changes.

Before using the guarded `EKODI Points Protected Free-plan Logical Backup (Manual)` workflow, the owner/security team must separately confirm:

1. Exact protected main SHA, existing `production` GitHub environment authorization and privacy policy.
2. The existing EKODI Storage Gateway and `GET /api/storage/v1/backup-acl` succeed on actual Google Workspace Shared Drive `EKODI` with approved inherited membership and unaugmented `99_BACKUP/SUPABASE_PROD/{ENCRYPTED_DUMPS,MANIFESTS,RESTORE_EVIDENCE}` folders. **No ACL proof → no export.**
3. `SUPABASE_PRODUCTION_DB_URL` protected environment secret points to project `renzehysxirjilvdxacv` (direct or session-pooler connection), with only an approved PostgreSQL user. This workflow never prints it. No other project URL is allowed.
4. `POINTS_BACKUP_AGE_RECIPIENT` protected environment secret contains an **owner-held off-runner X25519 age public recipient** (`age1...`). Its *private* recovery key must be safely retained outside GitHub, ChatGPT, Cloudflare and shared backup Drive, with documented custody and recovery procedure. Do not generate an unretained one-time key.
5. `EKODI_STORAGE_GATEWAY_KEY` exists as an approved protected existing server-to-server credential. No direct Drive OAuth secrets are introduced, and no broad Access/shared-drive memberships may be added as a shortcut.
6. Enough temporary GitHub runner space and a suitable PostgreSQL/Supabase-compatible isolated restore environment are available for a **separate, independent, actual restore drill**.

## Workflow behavior (after manual approval; no auto-start)

The workflow `.github/workflows/points-protected-logical-backup.yml` runs on exact, current protected `main` only. It explicitly requires the `production` environment and all approved secrets. It checks the real Drive ACL before any SQL or data extraction, installs pinned Supabase CLI v2.122.1 and `age`, then uses read-only `supabase db dump --db-url` with `--role-only`, schema and `--data-only --use-copy` to three private, ephemeral runner files. The files are packed, compressed, immediately encrypted to the owner recipient and then transferred **as encrypted bytes only** through `https://ekodi.kr/api/storage/v1/records` to the existing `backup` route.

The transfer script limits encrypted archives to **32 MiB** (fail-closed if larger; no new direct Google credential or public bucket workaround). It verifies the newly uploaded object's actual Drive parent and byte size via the existing protected provenance API, **downloads the saved ciphertext back**, compares the SHA-256 digest and size, and repeats the process for a separate `MANIFESTS` record. The manifest contains only project, main SHA, age recipient public-key fingerprint, encrypted file ID and digest/size, with `independent_restore_verified=false`, `two_signer_receipt_verified=false`, `production_schema_write_authorized=false`, `points_activation_authorized=false`. It intentionally provides no usable proof of decryption/restoration and never exposes the file IDs, customer records or plaintext in logs or Actions artifacts. All runner temporary files are removed in an EXIT trap.

**Important:** A successful encrypted upload is *not* yet a usable backed-up-and-restored production release. A different qualified custodian must download, decrypt using the owner-held private key, actually restore the Supabase-compatible SQL files into isolated nonproduction Postgres/Supabase, validate Auth/Person/tenant data, row counts, extension/RLS/grants/constraints and sign the independent restore evidence; only then can the existing two-independent-Ed25519-signer manual receipt verifier run. The owner and authorized security reviewers must also grant a separate schema-promotion decision. The new workflow explicitly cannot apply the 20 production points migrations, deploy the JWT points-api, or enable any member economic rewards.

### Distinct next receipts

- **ACL gate:** real protected `Verify Points Backup Drive Membership` run after Storage deployment.
- **Encrypted archive:** manual `EKODI Points Protected Free-plan Logical Backup` run, with actual stored ciphertext readback and *pending-restore* manifest.
- **Restore proof:** separately executed isolated restore with two independent signatures and original encrypted-file hash.
- **Production technical migration:** exact-main protected Orchestrator release, per-migration checks and rollback.
- **Economic points activation:** separate human owner, financial, compliance and security approval only.

No assertion that any of these operational receipts exists may be inferred from this document, a passing source CI check, or the presence of an uploaded encrypted artifact.
