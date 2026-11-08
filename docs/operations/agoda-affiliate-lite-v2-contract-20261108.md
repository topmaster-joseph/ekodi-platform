# Agoda Affiliate Lite API v2 — EKODI Mall secure integration checkpoint

Tracking: #8938. Contract: owner-uploaded `Affiliate_Lite_API_V2.0.pdf` (12 pages, published 2018-04-19). Owner reports CID `1980072` and issued API key. No secret was supplied to EKODI, and no live API authorization or Hotel Data File rights were independently confirmed.

## Implemented in this source task

`sites/ekodi-mall/api/agoda-lite.js` is a server-only, **unwired** read-only search adapter. Tests in `sites/ekodi-mall/test/agoda-lite.test.mjs` exercise a mocked provider with no actual credential usage.

- City search (`criteria.cityId`) and explicit hotel list (`criteria.hotelId`).
- `checkInDate`, `checkOutDate`, adult/child ages, `ko-kr`, `KRW`, max 30 results; input bounds and no stale dates.
- Strict authorized Agoda HTTPS hostname + exact path; no HTTP, arbitrary redirects, embedded credentials, malicious query strings or unexpected ports.
- Auth header `Authorization: SITE_ID:API_KEY`, optional matching body credentials only if provider explicitly approves the mode.
- Response validation of actual Agoda hotel ID/name, HTTPS landing URL, expected CID/hotel ID, dedup, safe image HTTPS. HTTP images in the legacy samples are omitted rather than proxied unsafely.
- No guest personally identifying data, booking, payment or bank mutation; never log or return the key.

## Why automatic live hotel listings are still gated

The owner-provided PDF explicitly lists `http://affiliateapi7643.agoda.com/affiliateservice/lt_v1` and says to contact Agoda for HTTPS. It also says header credentials must match body credentials **although both JSON sample bodies omit them**. These facts require a current provider-issued HTTPS endpoint and confirmation of the request profile. The PDF's Lite API must not be silently confused with the newer Agoda Demand API.

Required Cloudflare Worker-only runtime inputs (not yet configured/activated):

| Binding | Meaning |
| --- | --- |
| `AGODA_AFFILIATE_SITE_ID` | Site ID `1980072` |
| `AGODA_AFFILIATE_API_KEY` | Real issued key as Worker secret, NEVER checked into GitHub or shown in browser/chat |
| `AGODA_AFFILIATE_API_ENDPOINT` | Agoda-approved HTTPS endpoint with `/affiliateservice/lt_v1` |
| `AGODA_AFFILIATE_REQUEST_PROFILE` | Agoda-confirmed `header-and-body` or `header-only` |
| `AGODA_AFFILIATE_HTTPS_CONFIRMED` | True only after supplier verifies endpoint and current IP restriction |
| `AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED` | True only after data/image/rate reuse scope is confirmed |
| `AGODA_AFFILIATE_ENABLED` | True only after guarded staging and explicit release readiness |

All flags fail closed. **This PR alone will not populate public Agoda hotel cards** because it deliberately does not add an unauthenticated HTTP endpoint, UI feed, scheduled search, cache, provider key or unsupported hotel data.

## Next governed release

Under EKODI Orchestrator: verify official HTTPS URL, confirmed auth-body form, authorized egress IP/quota, content reuse rights and official city IDs; provision secret through an authorized Cloudflare-only path; implement scoped read-only Mall route and dated travel-search UI using the adapter; add TTL and controlled background cache only for authorized data; then tests, PR, staging, production and browser verification.

The separate Bank Information `Oops! Something went wrong` bug is an Agoda account-side payout issue and does not authorize relaxing API security or marking bank settlement ready.
