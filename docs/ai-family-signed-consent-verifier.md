# EKODI native CLI task-specific signed consent

Task #8636, parent #8621/#7796. This change implements **only a pure Ed25519 consent verifier**, not a signed-consent issuing server, device-token privilege escalation, process execution or production activation.

## Verification contract

- An independently trusted user-session consent broker must issue and sign the canonical `ekodi-ai-family-consent-v1` payload. The private signing key must remain outside the repository, server source, CI logs and Windows elevated Device Agent. `createSignedFamilyConsentVerifier` accepts only its public verification key.
- The signed fields bind **jobId + deviceId + requestKey + provider + nonce + expiry**, the non-elevated-user and read-only constraints, OAuth-only method, trusted `node.exe`/CLI script paths and SHA-256 digests, and the read-only workspace. Any mutation invalidates the Ed25519 signature.
- The maximum consent lifetime is **10 minutes**. Missing, future-dated, expired, ill-formed, unauthorized, API-key, non-read-only or unsigned consents fail closed.
- A **durable atomic** `consumeNonce(nonce,{jobId,deviceId})` provider is mandatory. It must return `true` only once across process restarts and device workers. In-memory Set is allowed in tests only, never for production; a missing or failing store blocks execution.
- Approval booleans such as `nonElevatedVerified` are part of the signed data, **not proof by themselves**. The native runner must additionally check the real Windows process token and OAuth status, compare actual binary SHA-256, renew the authenticated lease and enforce a working process-tree cancellation implementation.
- This verifier has no networking, secret storage, process launching or installed service. It must only be plugged into the user-mode composition after the previous Phase 4 runner source PR #8631 and guarded recovery #8633 have passed authentic CI and been merged.

## Tests and safety status

Local isolated genuine Ed25519 signature tests: **4/4 pass**. These tests generate ephemeral keypairs, do not commit the private key, and exercise mutation, device mismatch, replay, expiry, API-key mode and unavailable nonce store.

No signed-consent issuing broker, persistent nonce store, scoped device queue credential, user2/user3 Windows E2E, login-only admin UI or Cloudflare production telemetry is verified yet. `AI_ROUTE_FAMILY_AUTO_DISPATCH` remains default false, and this PR does not change runtime flags. Source PRs cannot merge or deploy directly; EKODI Orchestrator's guarded recovery lane owns release.

Status: **crypto verifier implemented, broker integration blocked by independent authorization / genuine deployment tests**.
