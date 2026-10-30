# EKODI GitHub API shared-budget admission foundation, issue 6630

This is a source-only server-side reservation primitive, disabled by default.
It does not issue a GitHub token, activate a webhook, merge PRs or dispatch actions.

Existing D1 quota observations from real REST response headers are authoritative.
A single SQLite INSERT SELECT atomically checks verified observation freshness
(30 seconds maximum), reset deadline, GitHub throttle, all short-lived same-
snapshot reservations and a 25-request safety margin. It grants at most
5 request units for 15 seconds. A hashed operation key prevents duplicate grants.
Missing data, expired observations, schema errors and insufficient quota deny.

The internal caller must independently validate the EKODI-owned GitHub App
installation token and Orchestrator task receipt; a Boolean context is never a
cryptographic proof and MUST NOT be copied from an HTTP request. The feature
flag EKODI_GITHUB_BUDGET_ADMISSION_ENABLED is intentionally absent from
production config. This code is not linked to any public mutation endpoint.

Next: owner-provisioned GitHub App HMAC and installation; real signed event;
authenticated reporter connecting measured GitHub response headers;
wire all official GitHub-call workers to the admission control, test concurrent
leases and actual rate limit response handling, and then authorize activation.
Until then the admin UI must report admission as not connected.
SQLite admission can coordinate participating workers only, not independent
unregistered clients using the same GitHub App installation token.

Run node --test test/github-api-budget-admission.test.mjs. Use EKODI protected
source PR, exact-head CI, staged D1 migration, guarded production and
production read-only verification. No paid service or independent scheduler.
