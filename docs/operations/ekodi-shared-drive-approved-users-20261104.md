# EKODI Shared Drive — approved user registration

Date: 2026-11-04 (KST) · Task: `storage-shared-drive-allowed-users-20261104`.

## Canonical Google Drive membership (provider verified)

Target is the **existing** organizational Shared Drive `EKODI`, Drive ID `0ACM_FnMYWMFuUk9PVA` (not a new or personal drive).

| Email | Google Drive role | Provider action |
| --- | --- | --- |
| `joseph@ekodi.kr` | `organizer` (Manager) | Existing role preserved; canonical EKODI Workspace steward |
| `topmaster.joseph@gmail.com` | `organizer` (Manager) | Existing role preserved; explicitly approved collaborator, not the service steward |
| `ekodibiz@gmail.com` | `writer` (Contributor) | Added via Google Drive permissions API, with email notification |

Evidence: An already authorized personal Google Drive Manager session on EKODI remote PC (user2), independently verified via the provider's `drives.get` capabilities; the target Shared Drive returned `canManageMembers=true`. Before mutation, the Drive's `permissions.list` showed `joseph@ekodi.kr=organizer`, `topmaster.joseph@gmail.com=organizer`, and `ekodibiz@gmail.com` absent. After an exact-email `permissions.create` with role `writer`, a second provider `permissions.list` showed all three accounts with the above roles. No credentials or OAuth tokens are recorded in GitHub.

## Platform authorization and account distinction

`STORAGE_PRIMARY_GOOGLE_EMAIL=joseph@ekodi.kr` **remains unchanged**. The production and development configuration now include the three exact addresses in `STORAGE_SHARED_DRIVE_APPROVED_EMAILS`; the policy file records the same accounts. OAuth for the canonical **primary steward** remains restricted to `joseph@ekodi.kr`.

The extra accounts can connect their own OAuth as a **secondary user** through the Storage admin interface; a signed expected account hint is verified against the actual Google OAuth identity. A non-allowlisted secondary is blocked from selecting the canonical Shared Drive, even if its Google token lists it. The admin UI lists approved accounts and their **platform connection** status separately from Google Drive's actual provider membership.

The developer environment intentionally has no production Shared Drive ID; adding an account to the approved list never mounts the production Drive in staging. No domain-wide grant, public permission, secondary elevation to canonical steward, personal-file deletion, or site access change is made.

## Validation and operational boundary

- Google provider role check: verified the above three members after the single new grant.
- Node source and cross-feature regression: 15/15 successful (approved list, OAuth identity, safe primary cutover, Cheonggye Sheets access).
- GitHub guard: protected worker PR must be promoted only through official EKODI Orchestrator recovery and Storage Control staging/production deployment.
- Actual Google Drive membership does not imply an active, separately consented app OAuth. Each additional account must sign in to EKODI Storage admin if it needs API-driven per-account access. Never display a `connected` status before the provider OAuth is completed.

Follow-up: review whether keeping personal `topmaster.joseph@gmail.com` as Google Drive `organizer` remains appropriate long term. The user's request approved its continued use but did not authorize role demotion, so no organizer permission was removed.
