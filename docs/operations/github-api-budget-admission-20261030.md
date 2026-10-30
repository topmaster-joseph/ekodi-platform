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

## GitHub App JWT and installed-repository proof (source-only; OFF)

A user-provided JSON field verifiedInstallationToken=true is not authentication.
The admission primitive instead requires a non-serializable WeakSet-branded,
immutable 25-second proof issued only after the trusted EKODI server calls:
1. Official GitHub App JWT endpoint GET /app/installations/{installation_id}.
   GitHub authenticates the App JWT and returns the actual installation ID,
   App ID and suspension state; these must match owner-controlled environment.
2. Official POST /app/installations/{installation_id}/access_tokens with
   repository scope restricted to ekodi-platform. GitHub, not the caller,
   issues the installation token. It is not saved in D1 or exposed in output.
3. Official installation-token endpoint GET /installation/repositories,
   confirming the canonical repository, and storing only GitHub's real
   x-ratelimit-* core headers in the existing D1 measurement ledger.

A copied proof, expired context, missing App ID or JWT, wrong repository,
permission error, missing budget headers or D1 failure all reject admission.
The fetchImpl parameter is strictly an internal deterministic-test seam:
never accept a browser/request-provided fetch, token, JWT, proof or identity.

This implementation does NOT generate the signed App JWT: an owner-provisioned
EKODI signer is still required. The minted installation access token is used
only within this bootstrap attestation and is deliberately not exported to
arbitrary code; issuing a verified token for actual API operations, their
same-session admission, and safe token refresh are separate pending gates.

Each attestation currently costs GitHub API requests. It must NOT be invoked
once per operation or per 25-second interval at platform scale. Before
activation, batch and reuse a trusted server-side issuer session, verify
measured quota freshness and load-test rate consumption, and connect every
official GitHub caller to the same authenticated D1 reservation. A new App
is not a loophole for GitHub primary/secondary rate limits.

Keep EKODI_GITHUB_BUDGET_ADMISSION_ENABLED unset. Before activation require
sovereign GitHub App/JWT setup, least-privilege installed permissions, GitHub
webhook HMAC, measured telemetry, multi-worker tests, guarded rollout and
production evidence. This code has no public route or protected merge API.

Run node --test test/github-api-installation-proof.test.mjs
test/github-api-budget-admission.test.mjs test/github-api-budget-control.test.mjs.
