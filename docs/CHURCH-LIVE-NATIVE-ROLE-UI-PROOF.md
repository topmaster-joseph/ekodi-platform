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

## Owner CI regeneration on synchronized release head

The official Convergent Merge reconciled the current branch against the latest protected main. GitHub classified the resulting bot-authored merge head as `action_required`, even though the preceding release-branch tests passed, including the native Chromium test. This documentation-only owner commit requests all required checks anew on the protected synchronized revision and does not modify runtime code, security or role claims.

## Second protected base refresh

Concurrent EKODI protected-main releases caused the official Orchestrator to sync this branch again, producing bot head `0b2e0e2a32f5bc9296a48d23d0307602a8b01834` with GitHub `action_required` checks. This owner-authored record re-executes normal required CI and first-party Chromium verification. It neither weakens release checks nor extends the client or server permission contract.
