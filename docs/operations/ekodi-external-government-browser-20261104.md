# EKODI Native Browser — External Government Portal Read-only Adapter (2026-11-04)

Task: \`ekodi-external-government-browser-20261104\` · central issue #8156.

## Design
- Does **not** modify \`config/background-browser-worker-policy.json\`, the canonical \`ekodi.kr\` origin gate or the existing release browser worker.
- New opt-in script \`scripts/ekodi-approved-external-portal-browser.mjs\` provides independent, ephemeral Playwright Chromium public-read access for exactly two official hosts: \`better.fsc.go.kr\`, \`www.bok.or.kr\`.
- Default and only permitted request methods: GET/HEAD/OPTIONS. POST/PATCH/PUT/DELETE are aborted.
- No interactive login, persistent profile reuse, OTP/password collection, login/session interception, screenshots of private forms, unrestricted redirect or user-owned desktop manipulation.
- Query strings and fragments are not part of evidence; response returns safe origin/path, status and \`submitted:false\`, never body text.
- Authentication, password form or external identity redirect emits \`AUTH_REQUIRED\` and disposes of the isolated context.

## Test
\`node --test test/ekodi-approved-external-portal-browser.test.mjs\`

Synthetic tests cover exact host/path allowlist, lookalike/HTTP/URL credentials denial, missing/forged approval denial, verified reviewer cannot submit, off-domain redirect, auth detection, 200 response sanitization, POST interception, incognito profile lifecycle and timeout.

## Expansion requiring separate owner authorization
Authenticated government filing requires its own reviewed **human-authenticated submission workflow**, separate from the unattended background-worker policy and never using personal browser cookies by scraping, copying or injection. A fresh task-specific server-issued permission, the user's portal authentication, explicit submit approval, callback/receipt capture and immutable audit are prerequisites. Login flow must not be spoofed and any CAPTCHA/MFA must be performed by the actual user.

## Legal filing evidence
- An email about how to file is not an official legal-interpretation application.
- A public portal page opening is not filing.
- Portal account creation is not filing.
- Only official successful application acceptance with a receipt/reference number and submission timestamp constitutes filing evidence.
- Browser test success does not imply regulator approval or PG license.

## Limits
- Does not implement a supported production authentication session bridge or an authorized mutation grant executor.
- Does not perform a legal submission.
- No production deployment or live browser canary has occurred simply by opening this PR.

## Release
Source is an additive capability candidate requiring protected EKODI Orchestrator review, controlled rollout and real native Chromium verification. Never merge a task branch directly into production main.
