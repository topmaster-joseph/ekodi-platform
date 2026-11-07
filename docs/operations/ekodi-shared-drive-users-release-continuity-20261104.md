# EKODI Shared Drive approved users — official orchestrator release continuity

Date: 2026-11-04 (Asia/Seoul); issue #8168; task `storage-shared-drive-allowed-users-fixed-20261104`.

## Protected release provenance

- Corrected worker PR #8223 functional SHA `9a77bc143dc28272b8ffa0d365856cab6d4760b0` (closed without worker merge on successful first-party recovery creation).
- Official EKODI Orchestrator recovery PR #8224, branch `ai/chatgpt/orch_recovery_9a77bc143dc28272b8ffa0d365856cab`.
- Original worker #8221 / stale recovery #8222 were closed; a previous exact-string test assumed the old Google OAuth payload and failed when the signed accountHint was added. The corrected source includes both fixed existing assertions and dedicated account allowlist tests.
- The corrected functional ancestor is preserved in the recovery branch. When this note was authored it contained current main with zero behind-main commits.
- This **documentation-only, owner-connected** commit requests authentic latest-head GitHub Actions checks. It does not forge a release receipt, bypass constitutional controls, merge the worker PR, deploy without approval, modify Google Drive provider membership or grant any financial/administrator access.

## Google provider membership evidence (verified, no secrets disclosed)

Target is organizational EKODI Shared Drive ID `0ACM_FnMYWMFuUk9PVA`. Using already authorized Google Drive Manager OAuth on EKODI remote PC, Google Drive `drives.get` returned `canManageMembers=true`. Before registration `permissions.list` showed `joseph@ekodi.kr=organizer`, `topmaster.joseph@gmail.com=organizer`, and `ekodibiz@gmail.com` absent. The exact new user was granted `writer` (Contributor) with Google notification enabled, followed by another authoritative `permissions.list` returning all three with roles `organizer`, `organizer`, `writer` respectively. Existing organizer roles were neither changed nor removed.

## Source scope and guarded acceptance

1. Production and development storage configs include the three exact approved addresses but **STORAGE_PRIMARY_GOOGLE_EMAIL remains joseph@ekodi.kr**. Development Shared Drive ID remains empty (no production Drive mounted there).
2. Canonical policy records the approved users; it does not claim that a config file grants Google provider membership.
3. Signed OAuth hint enforces real signed-in Google account for listed secondary; selecting the canonical Shared Drive as an unapproved secondary is rejected. Admin status displays approved accounts and separately identifies whether the *application* OAuth is connected. No Google membership is inferred from an OAuth hint alone.
4. Authenticated source contracts, Storage Admin contract, constitutional checks, Supabase Local CI and actual `deploy-storage.yml` validation must pass on the exact newest recovery HEAD before protected merge. Provider permission registration itself was completed separately and is not proof that the application OAuth was granted for each user.
5. Following protected merge, confirm Storage Control production deployment success for the merge SHA, verify live canonical admin/JS and 401 for unauthenticated Storage status. Actual secondary app OAuth consent remains per-account, not performed by a source release.
6. Never accidentally demote `topmaster.joseph@gmail.com` from its existing Google `organizer` status, replace Workspace service steward, expose credentials, or broadly share Drive contents.

No user content was read or changed by this source release; new provider membership is the only Drive permission mutation.
