# EKODI Insurance canonical API gateway — isolated contract review

Issue: #6569 · parent #6536 · local-record migration #6568 · quota incident #6524

**Status: draft contract only. No active routing, service binding, network request, D1 access, or production deployment.**

## Source of truth

- Canonical public UI: \`https://ekodi.kr/insurance\`.
- Future canonical API namespace: \`https://ekodi.kr/api/insurance/*\`, disjoint from public page assets.
- Current Insurance API Worker maintains its own encrypted D1 consultation storage, internal administration, data retention, rate limits, backend encryption keys and separate user consent. Its existing public-facing origin is **not** retired by this contract.
- \`sites/ekodi-insurance/api/canonical-gateway-contract.mjs\` classifies **only** these proposed public endpoints:

| Browser request | Private Worker path | Risk | Required gate |
|---|---|---|---|
| GET /api/insurance/health | /health | low, read-only | service binding + no-store |
| GET /api/insurance/network/catalog | /api/network/catalog | low, read-only | catalog remains compliance-disabled |
| POST /api/insurance/chat | /api/chat | user text | strict Origin + JSON + 64KiB hard body cap + D1 rate guard |
| POST /api/insurance/consultations | /api/consultations | consented contact | strict Origin + JSON + 128KiB hard body cap + encryption/D1 + rate limits |
| POST /api/insurance/consultations/{con_id}/revoke | /api/consultations/{con_id}/revoke | revocation bearer capability | strict Origin + JSON + 2KiB hard body cap + server token hash proof |

Only these exact public methods/paths are in scope. **No** internal admin, network management, provider feeds, quotes, product ranking, insurance signup, generic proxy, arbitrary URL redirect or wildcard forwarding. Query strings and URL fragments are rejected, especially to prevent tokens/health/contact data entering access logs.

## Gateway implementation, not yet performed

1. Register the exact \`/api/insurance/*\` namespace at the one authenticated apex router, **after** checking for overlapping existing \`/api/*\` handlers. Preserve \`/insurance\` static page operation and deny all other methods.
2. Dispatch using private Worker service binding. Do not perform dynamic \`fetch\` to a public \`insurance-api\` domain. Strip incoming cookies, Authorization, \`x-ekodi-insurance-internal-token\` and all unapproved headers; forward **only** \`accept\`/\`content-type\` from caller. Trusted Cloudflare client-IP and quota metadata require an independent security review, not user-controlled forwarded identity headers.
3. For POST, validate \`Origin: https://ekodi.kr\`, \`Sec-Fetch-Site\` where present, JSON media type, and **stream-read the actual request body with a hard cap**. The provided classifier checks Content-Length only as a preliminary fast reject; a missing/spoofed length MUST NOT bypass stream cap. Incoming empty or malformed JSON must still fail downstream. Cross-origin OPTIONS are never delegated.
4. Preserve existing API's encrypted D1, consent and revocation semantics, 30-day retention, rate limiter, tenant/role checks and Cloudflare quota fail-closed. Never substitute a generic apex admin token for server-issued consent/revoke capability. Do not leak backend exception details, tokens, secrets, contacts or transcripts into response, cache, logs or query strings.
5. GET-only canary is allowed **only** after Orchestrator authorization and verified contract. Require JSON \`cache-control: no-store\`, strict security headers and disabled catalog confirmation. Avoid ever publishing an open proxy. POST and revoke promotion require separate exact-sha synthetic browser E2E, with test callbacks explicitly contained and cleaned up, no real customer contact.
6. Keep legacy client paths and separate API origin working during migration. Update \`server-bridge.js\` to canonical same-origin paths **only after** the gateway has safe production evidence, with rollback and consultation token continuity. Do not redirect user data from a foreign origin.
7. Mobile/desktop/authenticated admin acceptance must have an official non-429 browser release receipt. If CF-QUOTA-001 circuit opens, stop rather than repeatedly probing production.

## Mandatory release gates

- Security review of trusted IP/rate metadata, Origin/fetch-site enforcement, CSRF and session cookies, service binding names, role/auth boundaries and CORS.
- Existing API verification of D1 schema, encryption key, token hash, retention, catalog disabled flag; no live raw PII output.
- Unit tests for public allowlist, HTTP method and Origin, Content-Type, payload caps, and prevention of query/credential/URL forwarding.
- Approved client-specific switch with ability to rollback without losing same-browser revocation credential.
- Exact EKODI Orchestrator \`orch_\` task and receipt, protected main checks, staging/reliability, guarded release, independent real browser proof and owner gate for host retirement.

**This PR is a policy/classifier scaffold only.** It must stay Draft and must not be advertised as a functioning API or production-ready integration.


## Isolated request-dispatch prototype (no public deployment)

New module: \`sites/ekodi-insurance/api/canonical-gateway-dispatch-preview.mjs\`.
This is **not imported into site-worker.js or any active API Worker**. It accepts
a previously validated apex request and an injected *private service binding* only.
It is not a direct external host proxy and it does not look up production secrets.

- Does exact classifier allowlist before contacting the injected binding.
- Rejects active CF quota-circuit requests with status 429 and no retry.
- Requires a verified edge visitor identity for every POST: the future caller
  must supply trusted client IP + user agent from a proven apex Worker/Cloudflare
  boundary; it must **never construct this object from caller-supplied headers**.
  Without it, all POST is 503; read-only GET can be mock-tested.
- Bounded streaming payload reader rejects POST bytes exceeding route-specific
  limits even with missing/false \`Content-Length\`. JSON must decode to a
  non-array object; consultation consent/revocation remain validated again by
  the actual API Worker.
- Sends only a new fixed internal-target request with \`Origin:
  https://ekodi.kr\`, JSON Content-Type, Accept, and *verified* rate identity.
  It never forwards incoming session Cookie, Authorization, arbitrary
  X-headers, referrer, query strings, or backend internal/admin token.
- Rejects redirects, malformed/non-JSON, oversized backend responses and
  private service exceptions. Returns only JSON with no-store/nosniff; strips
  upstream Set-Cookie, CORS, and cache headers.
- **REVIEW CANDIDATE**: this Draft also updates the Insurance API production
  source configuration to permit **exact** canonical apex and existing historical
  origins, with no wildcard and no removal of old-origin users. This is only a
  source proposal: effective runtime settings, actual deployment, browser CORS,
  and consented POST/revoke have NOT been verified. Do not spoof historical
  Origin or treat the proposed allowlist as proof of public API availability.

New offline Node tests use a fake injected service, synthetic request payloads
and deterministic verified visitor fixture. They confirm no private service
request is performed on input failure, spoofed identity, cross-site POST,
stream size overflow, upstream redirects, or open quota circuit.

### Before wiring any real route

Confirm Worker service binding name/target, apex edge-verified identity derivation,
backend \`ALLOWED_ORIGINS\` effective deployed configuration and dual-origin
backward compatibility, and that a
same-origin call is not inadvertently treated as authenticated admin. Independently
test the backend hourly rate-limit fingerprint to ensure that users do not all
collapse into an IP \`unknown\` bucket. Require a restrictive request timeout
and abuse controls before production, plus compliance review of stored contact
and shared transcript. Neither these tests nor a successfully compiled build
can replace official browser proof or a human authorization gate.
