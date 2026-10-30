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

## Authenticated installation attestation (source-only, default disabled)

A JSON field saying verifiedInstallationToken=true is not proof of authentication.
The admission primitive now requires a non-serializable WeakSet-branded
25-second context minted by the trusted EKODI server after GitHub authenticates
both the intended App installation (App ID + installation ID) and canonical
repository access over HTTPS. Only actual rate-limit headers returned from the
verified repository request are persisted in D1. A copied context, outdated
proof, absent signed-in token, missing headers or D1 error fails closed.
No bearer tokens, response bodies, user identities or URLs are persisted.

fetchImpl is only an internal unit-testing injection. Never accept a transport,
token, identity or proof from a user request. Token issuance is still a distinct
owner-provisioned GitHub App integration; this patch does not issue a token,
publish an HTTP route, change permissions, or trigger GitHub mutations.

Keep the production enable flag unset. Before activation require owner setup
of EKODI_GITHUB_APP_ID and installation ID, live token issuer, signed webhook,
verified response telemetry, all GitHub callers routed through admissions,
multi-worker concurrency tests and guarded production evidence.
Run tests for github-api-installation-proof and github-api-budget-admission.
