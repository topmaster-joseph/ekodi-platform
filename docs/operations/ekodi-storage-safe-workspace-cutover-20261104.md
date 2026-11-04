# EKODI — Workspace Google Drive primary-account cutover

Task: `storage-workspace-safe-cutover-20261104`. Related #8168, official primary-account release #8167.

The canonical organizational Shared Drive remains `0ACM_FnMYWMFuUk9PVA`; designated Workspace primary is `joseph@ekodi.kr`. An authenticated Gmail account, a Google Drive connector linked to a different account, or an OAuth `login_hint` do **not** prove management authorization.

## Two-phase cutover
1. **Stage only:** from `https://ekodi.kr/admin/settings/storage`, authenticate Google OAuth as exactly `joseph@ekodi.kr`. A connected-but-unverified row is staged without disabling the prior ready connection and without overwriting the Cheonggye Google Sheets credential cache.
2. **Select organization Drive:** the backend checks the actual Google `about` identity, the exact configured Shared Drive ID, `type='shared-drive'`, `capabilities.canManageMembers=true` and `canAddChildren=true`. The connection is rejected if Workspace Manager permissions are missing. The current route map is never reset at this stage.
3. **Bootstrap/verify:** confirm each existing canonical folder ID by searching within the selected Shared Drive root. A mismatch fails closed rather than silently repointing a tenant/site to a different Drive. A missing route is created only as necessary. A verified connection becomes `ready`.
4. **Commit cutover:** only after the new Workspace primary is ready are the encrypted Cheonggye credential cache and previous primary connections rotated. An administrator may not accidentally disconnect the last ready primary before a replacement.
5. **Observe:** confirm the admin storage status reports `primaryAccountMatched=true`, all routes ready, and a canary write/read scoped to an authorized tenant. Verify permissions from the actual Workspace account before copying any confidential business documents.

## Safeguards
- Denied or abandoned OAuth cannot revoke the existing production connection or its route map.
- During migration, the UI distinguishes `connected` (setup pending) from `ready`. Do not show an OAuth-only login as cutover completion.
- Existing role, file revision, folder and site access policies must be preserved. No bulk public sharing, role escalation, permanent deletion, financial export or Supabase backup migration is authorized by this code change.
- If an existing route ID points to a different source Drive, bootstrap refuses to overwrite it. Such routes require a separate source-to-destination asset and link migration with reversible mapping.
- A manager role can be revoked by Google Workspace after setup; operational monitoring and credential reauthorization remain necessary.
- If the primary account cannot be verified, keep the old connection working and the migration **incomplete**. Do not delete old originals or claim enterprise-drive separation.
