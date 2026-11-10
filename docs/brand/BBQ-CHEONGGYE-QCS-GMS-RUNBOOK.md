# BBQ 무안청계점 — QCS × GMS 독립 매장 운영 청사진
> 2026-11-10 / proposal; no franchise authorization, POS integration or direct-production changes implied.

## Brand promise
- Display identity: **BBQ 무안청계점**. Preserve original brand and franchise rights. Do not expose EKODI platform branding to consumers.
- Customer-facing proposition: "좋은 한 끼를 위한 세 가지 약속" (Quality, Cleanliness, Service).
- Branding must never misrepresent photo/menu/price or imply the store owns Genesis BBQ's intellectual property.
- Owner/approval: authorized BBQ store operator approves final display and alignment with franchisor.

## 0. Source interpretation
The store owner supplied photographs from training slides. They describe QCS (Quality, Cleanliness, Service), GMS (Genesis Marketing Strategy), franchise joint purchasing/logistics/marketing, direct order/loyalty comparisons, and a business-owner mindset. These are **training context**, not independently verified current fee, price, point or official marketing policies. Do not copy slide photos, proprietary posters, recipes or training materials into the public page.

## 1. Quality / Cleanliness / Service: action checklist

| Shift | Owner / shift lead | Evidence | Escalation |
| --- | --- | --- | --- |
| Open | Check official current menu availability; receiving/storage conditions; work surfaces and equipment; opening readiness | Pass/issue + timestamp (store-owned private only) | Raise food-safety or equipment concerns immediately; do not override franchise safety rules |
| During service | Verify order details and packaging, delivery/packaging status, cleaning routines, factual customer information | Verified order/complaint status only with authorized system access | Responsible person handles exceptions, corrects, follows up |
| Close | Clean/sanitize; reconcile order-channel totals against POS where authorized; identify process improvements | Exception log with minimal necessary information | Escalate unresolved differences; no automatic financial writes |

No time/temperature recipe thresholds are invented; only approved franchise procedures supply them. The store manager remains responsible for staff training and compliance.

## 2. GMS applied as channel strategy, not copied policy

**Customer journey:** store page → official BBQ menu/order → available delivery/takeout/phone channel → fulfillment → consent-based customer support → improvement. QR is currently **information-only**; it must not state that a direct payment or online store order exists unless separately verified.

**Review and marketing:** optional channel-by-channel analytics only when store credentials and permitted integrations exist. Review access is permitted only by platform authorization. No fabricated reviews, prohibited incentives or bulk extraction. No unsolicited marketing or automated uploads of customer information. Events/benefits only from current BBQ HQ or other properly approved programs.

**KPI definitions (no target or claim of current performance):**
- Order accuracy = correct orders / verified orders
- Issue resolution = confirmed resolved cases / confirmed incoming cases
- Channel contribution = channel net revenue / verified total net revenue (when records allowed)
- Repeat order = consented repeat customer metric, never inferred from anonymous page visits
- Daily QCS checklist completion = completed steps / applicable approved steps

Default missing data is "미연결/확인 필요", never zero or artificially green.

## 3. Operating view / interaction design
- Store admin homepage: limited to actionable tabs — 품질·위생 / 주문·채널 / 마케팅·리뷰 / 교육·인쇄 / 설정.
- One-screen priority card on a narrow mobile viewport: today's checks, outstanding issues, action buttons.
- The QCS checklist is private and must use the existing tenant identity, role policies, RLS, audit and approved persistence mechanisms; **do not** store employee details in an unprotected client cache.
- A public read-only service promise route `/bbqcg/service-guide` is implemented as an optional companion page (noindex until approved). The root navigation and any operator data writes are not in this independent PR.
- Public route must verify store-user-sites source and paused status. Public content excludes private training and real-time staff/POS/customer information.

## 4. Independent AI role, permission limits
BBQ site's own scoped AI may: propose day-by-day checklist summaries, highlight discrepancies, draft owner-reviewed campaigns, and report aggregated non-identifying activity. It cannot: control headquarters prices/discounts, issue unapproved benefits, alter provider orders, merge tenant data, reveal internal training, issue refund or change payment amounts without appropriate human and platform gates.

## 5. Operational entry evidence and rollout
- Current canonical customer URL: https://ekodi.kr/bbqcg ; obsolete /bbqcheonggye must remain hard 410.
- Prior source contains a public site, informational QR and independent store admin.
- This PR registers an additional non-indexed public service promise route using Space Worker (read-only).
- Do not modify conflicting unresolved PRs (#9063 CSS fingerprint, #9068 test, #9076 admin nav, #9014 verified store facts).
- No production deploy before central release/owner and CI clearance. Staging and real-host checks must verify actual Space route, source tenant, HEAD/POST methods, noindex, no cross-tenant exposure, old-route 410, admin auth and no console errors.
- Owner and official franchise material approval must precede linking from public home.
