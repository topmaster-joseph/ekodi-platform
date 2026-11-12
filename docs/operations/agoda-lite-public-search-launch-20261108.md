# Agoda Affiliate Lite 자동 숙소검색 정식 활성화 절차

Date: 2026-11-08 KST. Parent #8938. CID 1980072, campaign tag ekodi_mall_stay.

## Implemented
- Read-only Mall Worker public API GET /api/public/agoda/status and GET /api/public/agoda/search.
- Via canonical site: /ekodimall/api/api/public/agoda/status and /search.
- Travel tabbed search (official Agoda API, existing verified affiliate list) and guarded hotel cards (official hotel name, image, KRW nightly amount for specific dates, CID+tag booking link).
- Server limits: allowlisted city IDs, check-in/out + 1-6 adults, max 30 hotel rows, 5-minute Cloudflare cache. No email/guest identity or browser keys.
- Missing any approval, secret or city list => status unavailable, no hotel cards, existing Agoda official text-link remains.
- No repeated CSV upload.

## Supplier authorizations required before public activation
1. Agoda ticket 00796383: get currently supported approved HTTPS Affiliate Lite endpoint and precise authorization request profile (header-only vs header-and-body), plus any allowlisted egress IP and request quotas.
2. Confirm that hotel photos, names, rate quotes and booking links may be published under EKODIBIZ CID 1980072 on ekodi.kr.
3. Supply real city IDs and approved display names from official source; old sample PDF ID is not authoritative enough to label a city.
4. Provision issued key ONCE via Cloudflare Workers Secret on ekodi-mall-api. Never expose key in chat/GitHub/frontend/Pages/D1/logs.

## Proposed Worker-only settings
- AGODA_AFFILIATE_SITE_ID = 1980072
- AGODA_AFFILIATE_API_KEY = confidential Cloudflare Worker Secret
- AGODA_AFFILIATE_API_ENDPOINT = vendor-confirmed HTTPS endpoint /affiliateservice/lt_v1
- AGODA_AFFILIATE_HTTPS_CONFIRMED = true only after official evidence
- AGODA_AFFILIATE_REQUEST_PROFILE = vendor-approved header-only or header-and-body
- AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED = true only with rights evidence
- AGODA_AFFILIATE_CITIES_JSON = JSON array of confirmed {id,name} city records (do not use fake samples)
- AGODA_AFFILIATE_ACCOUNT_APPROVED_CONFIRMED = true **only after authenticated Partner Center explicitly reports affiliate account approved**. Never infer from an email auto-acknowledgment, CID issuance, or key issuance.
- AGODA_AFFILIATE_CID_ACTIVE_CONFIRMED = true **only after Partner Center Manage Your Sites shows CID 1980072 active**. Never infer from a syntactically correct referral URL.
- AGODA_AFFILIATE_ENABLED = true only after vendor and secret confirmation
- AGODA_AFFILIATE_PUBLIC_SEARCH_ENABLED = separate public gate (default off)

## Required production gates
1. Full source tests, security/Constitution/orchestration/parallel checks.
2. Protected staging deployment and disabled-mode tests (status false, search 503, no secrets).
3. Real provider-approved HTTPS call on staging, verify exact city ID and hotel ID, image rights, prices, Agoda redirect CID and anonymous tag.
4. Configure Cloudflare WAF/rate limiting before public enablement: 5-minute cache alone is NOT complete per-client abuse prevention.
5. Protected production deployment; verify desktop and mobile actual hotel cards, edge cache and rate/rights freshness; retain fallback referral and rollback flags.
6. Do not mark #8938 complete until legitimate hotel cards appear on the live public site. No payment/booking execution in EKODI.

## Independent payout issue
Agoda Bank Information error on South Korea/USD still unresolved. No bank account identifiers in CI/GitHub or this API project.

## 2026-11-12 account status checkpoint / remediation case
- Authenticated Partner Center on 2026-11-12 still shows `1980072 / EKODI MALL / 비활성화`, and Tools > API says account approval pending and CID selection unavailable.
- Company Gmail confirms case **00797486** was opened at 2026-11-12 12:45 KST for account activation and Bank Information error. The acknowledgment erroneously categorized Existing Partner as No; a corrective same-thread email was sent asking to change this to Yes.
- Independent official technical support case 00796383 replied that Affiliate Lite API is self-service and was CLOSED on 2026-11-10. No approved HTTPS endpoint/rights or bank resolution provided.
- Account/site flags default false/absent, so even if all API, photo rights and secrets are configured, search and cached hotel results remain unavailable until both approvals independently verified. Existing direct Agoda referral remains technically functional; **commission tracking/revenue must not be claimed while CID is deactivated**.
- Status changes must be substantiated by current authorized Partner Center evidence; no automatic guessed activation or provider login scraping.
