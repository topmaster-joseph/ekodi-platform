# EKODI Workspace Shared Drive primary-identity migration (2026-11-04)

Task: `storage-joseph-workspace-primary-20261104`.

## Canonical destination — reuse the existing EKODI Shared Drive

The EKODI Shared Drive with ID `0ACM_FnMYWMFuUk9PVA` is already the system-of-record in `wrangler.storage.toml`, `config/storage-policy.json` and the running storage gateway. Reusing this drive, rather than creating a competing shared drive, preserves storage route IDs and application links.

**Workspace service steward:** `joseph@ekodi.kr`. The personal account `topmaster.joseph@gmail.com` is a migration-source account only, never a canonical production primary identity. Primary OAuth now requires the exact Workspace email before disabling any old encrypted connection. The administrative storage view reports whether the stored primary account and canonical drive ID match.

A Shared Drive is organizationally held. **An account name in configuration is not proof that the account has the Google Drive Manager role.** Verify that the Workspace account is a Manager on the actual drive and can list/write/read all expected routes before retiring a legacy account.

## Provider-backed inventory and transfer verification

- The connected Google Drive account for the migration inspection was `topmaster.joseph@gmail.com`. The personal My Drive contained a separate `EKODI` folder with ten canonical-like section folders. The Google Workspace Shared Drive already had the ten canonical section folders.
- Source `02_CHURCH/261011_주일예배_오디오`: eight MP3 and eight MP4 assets. All **16** were copied to the real Shared Drive under `02_CHURCH/261011_주일예배_오디오`, preserving the MP4 subfolder. A second Drive listing compared original/destination names and reported sizes: **16 of 16 matched**. No originals were deleted, moved, or permissions revoked.
- Source `05_COMMUNITY/청계면상인회_브랜드자료실`: three top-level trademark/brand documents and fourteen files inside `원본_AI_비공개`. **These seventeen items have not been copied**. Confidential originals require verified Workspace Manager membership, destination visibility restrictions, authorized tenant access, and separate per-file verification before transfer. A folder name containing `비공개` is not itself an access-control mechanism.
- The personal root's remaining eight section folders were empty in the bounded inventory and need no blind duplication.
- `EKODI/99_BACKUP/SUPABASE_PROD` exists in the canonical Shared Drive. Its `ENCRYPTED_DUMPS`, `RESTORE_EVIDENCE` and `MANIFESTS` child folders were created and read back under the correct Shared Drive ID. **No Supabase production dump or encryption key has been exported or stored yet.**

## Finish criteria and no-delete protections

1. An authorized Workspace login by `joseph@ekodi.kr` explicitly verifies Manager membership on Shared Drive `0ACM_FnMYWMFuUk9PVA`. Do not infer membership from access by `topmaster.joseph@gmail.com`.
2. Use `https://ekodi.kr/admin/settings/storage` to connect the exact Workspace account as primary and select the existing EKODI Shared Drive. Confirm the storage status reports `primaryAccountMatched=true`, and the canonical folder routes are ready. Do not treat an OAuth login hint as account verification; the server callback enforces the exact authenticated email.
3. Inspect destination membership and access restrictions, then transfer remaining personal `EKODI` assets only to suitable tenant-scoped locations. Preserve original file names, sizes, revisions/metadata when the Google APIs support them. For restricted archives, verify least privilege before any copy.
4. Reconcile file counts and destination Drive IDs, test at least one representative file opening from the Workspace login, and audit downstream links referencing old personal file IDs. Do not delete old links while consumers still depend on them.
5. Deactivate any personal-account primary/secondary integration only after independent cross-account verification. Permanent deletion of personal original files requires a separate explicit deletion authorization and verified restore point.
6. The backup directories are destination scaffolding, not an actual recovery point. Supabase Free has no verified recent backup; any encrypted export and isolated restore still require approved credentials, approved key custody and successful restore proof. Preserve `POINTS_ENABLED=false`.

## Constitutional boundary

No AI agent may create or assert Google Workspace user memberships from a personal OAuth connection. No bulk sharing to a domain, public visibility, transfer of confidential brand/IP files into an unchecked Shared Drive, or destructive deletion is authorized by this bounded migration step. The official EKODI Orchestrator guards source-code deployment, while Google Workspace account-level consent and membership administration remain distinct provider authority gates.
