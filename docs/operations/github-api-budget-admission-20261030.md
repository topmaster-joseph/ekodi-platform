# EKODI GitHub API shared-budget admission foundation, issue 6630

This is a source-only server-side reservation primitive, disabled by default.
The reservation function issues no token. A separate, disabled-by-default
attestation helper uses the official GitHub App JWT API to mint an ephemeral
installation token for proof only; it does not activate a webhook, merge PRs,
dispatch actions, or expose a token to a caller.

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

## Read-only signed GitHub App attestation (source-only, OFF)

This module now REUSES the existing verified read-only signing and measured
quota provider github-app-readonly-probe.js. It does not maintain a second
JWT generator, installation-token issuer, identity lookup, D1 reporter, or
duplicate GitHub call path. Exactly two outbound GitHub API calls occur only
after BOTH EKODI_GITHUB_BUDGET_ADMISSION_ENABLED and
EKODI_GITHUB_READONLY_PROBE_ENABLED are explicitly set true and the real
server-side private key, App ID and installation ID are provisioned:

1. The existing probe signs an RS256 JWT using the protected App PKCS#8 key.
   Official POST /app/installations/{id}/access_tokens explicitly requests
   only metadata:read permission and a single canonical repository.
   The actual GitHub grant response is verified for precise repository scope,
   no extra write rights and a future expiry.
2. The issued short-lived read-only installation token makes the sole
   GET /repos/topmaster-joseph/ekodi-platform request, verifies repository
   identity, and persists only actual GitHub core rate-limit headers to D1.

Only successful read-only evidence returns a private WeakSet-branded, frozen,
25-second in-process attestation proof. Copied object fields and a plain
verifiedInstallationToken=true boolean cannot mint or impersonate the proof.
It is proof of the observed App identity, NOT a write-capable installation
token, operation authorization or release approval. The only outward object
contains booleans and IDs, not JWTs, tokens or private keys.

The deterministic test fetchImpl/subtle injection is for trusted internal tests
only. Never pass a transport, key, proof or identity from HTTP input. The
existing separate App probe is also OFF by default; keeping either flag absent
prevents GitHub API requests and D1 mutation.

The short-lived proof MUST NOT trigger new JWT signing and token issuance for
every operation. Before activating shared admission, implement a trusted
bounded issuer/call-session cache, preserve verified same-installation token
identity on real operations, enroll all official GitHub API callers, load-test
D1 concurrent leases, signed webhook, actual rate headers, rollback, and
owner-authorized protected release. No feature flag is changed in this PR.

Tests:
node --test test/github-api-installation-proof.test.mjs
test/github-api-budget-admission.test.mjs
test/github-app-readonly-probe.test.mjs
test/github-api-budget-control.test.mjs
