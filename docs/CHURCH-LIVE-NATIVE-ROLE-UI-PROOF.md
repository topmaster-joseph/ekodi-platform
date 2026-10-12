# EKODI Church live UI native Chromium proof

This release targets the already-published `https://ekodi.kr/ekodichurch/` page and its hidden-by-default worship management link. The EKODI-owned Chromium runner expands the live worship section, checks visitor hidden, intercepts only the `worship-access` HTTP capability locally to test a **synthetic** authorized visual state, tests synthetic revocation, then logout hiding. Synthetic authorization and fake tokens MUST NOT reach an external host or be called real Google login.

## Evidence and safeguards
- Owner-approved original #4358, exact SHA `8c2bf05f9a3355ef8527d228a260df73bce94f8d`; recovery PR #4364.
- Official Orchestrator receipt: `orch_recovery_8c2bf05f9a3355ef8527d228a260df73`, authorized.
- Own Chromium proof: GitHub Actions #38249371801, success. Earlier #38248879209 success.
- Tests: `test/church-native-ui-capability-contract.test.mjs`, original full CI, native UI proof.
- Production API v10 ACTIVE with user-scoped RLS church tenant-admin proof; the first-party negative HTTP probe remains separate.
- Do not expand staff permission, permit finance access, capture real bearer tokens, inject a real Google login, or bypass protected status checks.

## Protected integration
The original authoring PR #4358 is closed as a duplicate, and #4364 is the sole reviewed candidate. Official Convergent Merge may sync latest `main` and regenerate the required ephemeral merge SHA statuses; this owner-authored documentation commit requests those checks on the current release branch. The live real-account 200/403 and actual logout/revocation remain unverified until an authorized user browser session is supplied to the native EKODI runner.
