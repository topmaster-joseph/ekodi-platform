# EKODI Church Google sign-in return: production release contract

## Problem
The production Church public and administrative site is mounted at `https://ekodi.kr/ekodichurch/`. The direct Google SSO, legacy SSO, workspace handoff and server `access-api` had retained an obsolete Church subdomain destination, so signed-in users could be sent away from the canonical Church admin route.

## Narrow fix
- Direct and compatibility auth realm: canonical Church home `https://ekodi.kr/ekodichurch/`.
- Explicitly restrict the `site=church` return path to `/ekodichurch` and descendants.
- Apply the same checks to the workspace handoff flow and server `access-api` target validation.
- Protect every other tenant's return destinations and preserve the existing single-use Google handoff mechanics.
- No additional Google scopes, elevated account rights, customer data access, or authenticated browser-token extraction.

## Verification and rollout
1. PR #4333 source at exact SHA `838dffb4651d6e1a959fc87dd87041f09f07b946` has a repository-owner Human Gate approval and authorized EKODI Orchestrator recovery receipt `orch_recovery_838dffb4651d6e1a959fc87dd87041f0`.
2. `test/church-canonical-google-auth-return.test.mjs` executes all four URL validators with Church home/admin allow and cross-tenant/external/retired-host deny. Full CI and EKODI Zero-Subdomain Guard are required.
3. Guarded merge and official Apex auth release are necessary; do not treat successful PR checks as production deployment.
4. The Supabase `access-api` deploy is independent and must preserve its current function authentication boundary, use the approved source exactly, and pass staging before production.
5. From real `https://ekodi.kr/auth/?site=church&direct=1&return_to=https%3A%2F%2Fekodi.kr%2Fekodichurch%2Fadmin%2Fworship`, verify that SSO returns to the canonical route. Authentication cannot be impersonated by a guest browser. An actual authorized operator's 200 and signed-in unauthorized 403 are separate human-session checks.
6. Anonymous Church worship/finance endpoints continue to deny HTTP 401 and cross-origin requests HTTP 403. Keep the prior approved deployment source available for rollback.

## Protected-base CI regeneration
This documentation follow-up is a repository-owner action after the Orchestrator-issued branch was verified. It requests fresh required status checks for the exact current PR head and allows the official Convergent Merge workflow to reconcile protected-main changes without bypassing protection.

## Protected source revalidation (synchronized main)

The EKODI Orchestrator synchronized this branch with protected main and generated merge head `81eb845b34d7f615a8e1b632b9cb6f3a65c5398f`. GitHub classified the associated bot-authored PR checks as `action_required`, so the repository owner added this documentation-only record to trigger fresh required checks on the synchronized head. No Auth/Access API implementation changed and no required check may be bypassed.

## Second protected merge-base refresh

The Orchestrator synchronized again after other protected EKODI changes merged. GitHub classified the new bot-authored head `cf36312c8f64deb9bd79e8a8aa638870f599cf09` as `action_required`. The repository owner requests normal CI on this exact refreshed head. Production access-api is an existing two-file Edge Function (`access-api/index.ts` + `_shared/trust.ts`, `verify_jwt=true`); preserve both and the verifier mode across any guarded release. Do not report authentication E2E complete from anonymous checks.
