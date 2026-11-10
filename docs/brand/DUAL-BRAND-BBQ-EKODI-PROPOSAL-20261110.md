# EKODI / BBQ 무안청계점 — 독립된 두 브랜드 운영 모델 제안

> Date: 2026-11-10 | Task: brand-dual-bbq-ekodi-proposal-20261110
> Status: DESIGN PROPOSAL. No website, authentication, data, legal registration or deployment change.

## Decision: separate brands, different responsibilities

**BBQ 무안청계점** is a customer-owned Genesis BBQ franchise store. It keeps the official franchise identity, uses EKODI capabilities only as authorized infrastructure, and must not display EKODI as a store co-brand. The site is `https://ekodi.kr/bbqcg`. The discontinued `/bbqcheonggye` locator remains retired.

**EKODI** is an independent, federated living-commons ecosystem. It is not a BBQ parent, franchisor or company analogue. Core beliefs are Ecclesia, Koinonia, Diaspora and Jubilee, expressed through local agency, optional connected services and a restrained central AI steward. No brand-right or operational authority transfers merely through technical integration.

### A. BBQ location: customer-facing release specification

- Primary promise: **우리 동네에서 쉽고 정확하게 주문하는 BBQ 무안청계점**. Proposed campaign copy: “맛있는 순간, 우리 동네 BBQ.” Do not misstate as an authorized BBQ HQ slogan.
- Visual system: existing franchise logo/color usage subject to franchisor instructions; proposed supporting navy, warm gold, cream, high-contrast on-premise information. Official marks and product photography require permitted assets.
- Information architecture: **매장안내 / BBQ 메뉴 / 주문하기 / 매장소식 / 오시는 길**. One visible store-specific headline; mobile short top navigation; no unnecessary operational KPI boxes on public page.
- Verified local data: store-supplied 11:00–23:00; 061-453-8295; 전남 무안군 청계면 승달산길 37-1, 1층. The live runtime must continue to prefer verified `store_user_site_public_snapshot` values; avoid guessing opening hours or pretending 'open now'.
- Official BBQ menu content is linked to `https://bbq.co.kr/`. Store-specific items, prices and availability are shown only after site-operator verification. Photograph mockups must be labeled conceptual, never represented as actual HQ product images.
- Conversion order: **official order page → verified store phone → location-specific external delivery channel links only after operator verification → on-site QR to own order-guide page**. QR is informational, not proof of direct payment.
- Operator tabs: store facts, locally approved menu, channel links, store notices, customer inquiries, print-friendly approved cards. Protected recipe/operating-law summaries must remain permission-scoped; never ingest restricted BBQ HQ curriculum without a license.
- Tenant and brand separation: only `bbqcg` store roles can operate the site; platform-admin grants do not implicitly become local permissions. Same legal owner/customer identity and immutable `workspace_id` maintained.
- Deployment prerequisites: reconcile concurrent BBQ release PRs, validate actual verified public facts, run 320/390/768/1366/1440 responsive checks, tenant/RBAC/SEO/410 regression, central guarded promotion and live-origin smoke tests. Preserve explicit noindex state until permitted publication.
- Measure: verified local data coverage, store CTA clickability, menu correctness, order-link validity, QR readability, accessibility, mobile LCP/CLS, error reports. No invented sales conversion claims.

### B. EKODI: new federation-oriented branding proposition

- Master name remains **EKODI / 에코디** (provisional; official trade mark search not complete).
- Working theme: **A Living Commons / 열린 생명의 연결망**. Working tagline: **따로 서서, 함께 살리다.** Secondary English: *Independent in purpose. Connected in care.*
- Explicitly differentiate from food franchise branding: no borrowed BBQ imagery, gold franchise visual hierarchy, uniform branch layout or HQ-style operating-control metaphors.
- Visual proposal: **open constellation** — open, differently placed paths with multiple local nodes; no visual claim that one central node owns all satellites. Palette (proposal only): deep ink `#0D2E30`, teal `#177C75`, gentle aqua `#9DD8CD`, coral `#EC8569`, ochre `#D8AA5F`, warm ivory `#F6F5ED`.
- Four values are parallel relationships, not compulsory sequential steps: Ecclesia/participation, Koinonia/sharing, Diaspora/contextual independent action, Jubilee/restoration.
- Service concepts (descriptive, NOT new registered services): **EKODI Stewardship** = brand charter & rights governance; **EKODI Commons** = reusable core capabilities; **Independent Spaces** = tenant-owned identities; **EKODI AI** = policy bounded coordination of site-owned AIs.
- Brand architecture: shared constitutional and security floor, separately owned BI/finances/tenants/AI agents/communications, optional capability integration via tenant-scoped APIs. Shared branding and Powered-by lockups require explicit mutual license, not automatic co-branding.
- Central reporting: compact per-site status and **자세히** delegation to that site's own management context; never centralize customer private data or silently elevate tenant roles.
- IP: prioritize active trademark clearance on Korean and Roman marks and the chosen symbol; decide the actual applicant/rights holder and inter-entity licenses before filing. A patent candidate must be concrete technical invention with prior-art review; philosophical values and brand names are not patents.

### Distinctive separation tests

| Question | BBQ 무안청계점 | EKODI |
|---|---|---|
| Who owns the user-visible brand? | Franchisor's official brand, used by authorized franchise store | Separate owner to be confirmed |
| Who operates local activity? | Authorized store operator | Each independent site/tenant owner |
| Who controls product quality / identity? | BBQ HQ applicable agreement and verified store operator | Human charter + mission governance |
| What is shared? | Only permitted technical capabilities | Approved reusable core API contracts |
| Logo/visual appearance? | Official BBQ guidelines | New independent design proposal |
| AI power? | Tenant-scoped operations assistance | Inter-site consultation, audit and summary |
| Can a central AI publish an irreversible brand or legal action alone? | No | No |

### Release approach (non-deployed proposal)

1. Keep this documentation in an isolated PR. Avoid overlapping the open BBQ recovery PRs on `bbq-cheonggye-site.js`, `space-worker.js`, or store authentication.
2. Let EKODI orchestrator resolve ongoing CSS/admin/verified-data recovery serially; do not override protected gates.
3. After current canonical BBQ work is confirmed, issue a **separate small implementation PR** for reviewed store UX and verified conversion links, with real environment data and tests.
4. Test and review the EKODI master brand separately: at least two design directions, a trademark clearance record, legal rights-holder decision, site opt-in policy, and distinct functional pilot.
5. No production deployment, trademark application, franchise trademark sublicensing or central brand mandate is authorized by this design document.

## Owner acceptance criteria

- [x] Two branding responsibilities are separated conceptually
- [x] BBQ store conversion flow and permission boundaries specified
- [x] EKODI creative visual and organizational concept independently defined
- [x] Mobile, SEO, security, roles, rights, rollback and measurement gates listed
- [ ] HQ brand-asset usage and vendor permissions verified
- [ ] Store order links and verified menu approved by local operator
- [ ] Human master-name/symbol/legal-rights owner decision
- [ ] Reviewed implementation, central CI, release and real public URL verification

**Previous concept:** Draft CI proposal PR #9183 is an option, not the authoritative EKODI trademark or rollout. This document sets out a distinct alternate direction.
