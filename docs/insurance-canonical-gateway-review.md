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
