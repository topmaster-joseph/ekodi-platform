# Toss Payments — EKODI merchant review / protected release checkpoint (2026-10-31)

## Authoritative release provenance
- Original PR: #7083 (closed as superseded by EKODI Orchestrator, **not merged**).
- Original functional HEAD: `d8faa24f55e1fa415f6a8f7d568693dc86e06b32`.
- First-party recovery task: `orch_recovery_d8faa24f55e1fa415f6a8f7d568693dc`.
- Protected recovery PR: #7098; branch `ai/chatgpt/orch_recovery_d8faa24f55e1fa415f6a8f7d568693dc`.
- This **documentation-only, owner-authored checkpoint** requests authentic GitHub PR checks after bot-created workflow runs were `action_required`. It must not be used to forge statuses, bypass branch protection, or claim release success. The approved original functional SHA must remain in ancestry. Continue through authentic CI, provenance gate, guarded merge, staging, production verification, and rollback readiness.

## Scope carried by recovery
Only merchant telephone disclosure is modified: common legal footer configuration/rendering, browser footer, EKODIBIZ local footer (six locales), regression test. No payment, buyer PII, actual purchase, settlement, or supplier automation is enabled.

## Current merchant onboarding blockers (do not mark ready)
- Published `https://ekodi.kr/ekodimall/checkout/` is a consultation basket, not a card payment checkout.
- Mall product listings include pending/partner/externally purchased items. A displayed product or external affiliate link does not demonstrate a direct-purchase-ready item on the merchant site.
- Official Toss review criteria include an actually sellable product, displayed merchant identity/address/telephone, guest purchase accessibility, and an opening TEST card payment window. Do not invent a price, SKU, stock, publishing/delivery readiness, or bank details to satisfy the review.
- A book shown at 9,900 KRW links to a third-party selling channel; do not represent this external checkout as EKODI's own PG checkout.
- Review the business-registration certificate and the actual merchant's name/address, including whether the historical jurisdiction string is an exact legal match. Do not publish the representative's home address.
- The Toss contract submission and address proof are account-holder actions inside Toss's authenticated onboarding site; do not store personal documentation or payment API secrets in GitHub.
- Ensure the configured test client/secret keys match each other. A test-only preview may not unlock `PAYMENTS_ENABLED` live. Store secret keys only in an authorized secret manager.

## Release verification
1. Authenticated native CI/AI governance/security/shell/deployment jobs are green on the recovery HEAD and its protected merge SHA.
2. Common footer and EKODIBIZ footer show the documented phone number, with working `tel:` links, on desktop and mobile.
3. Direct-purchase eligibility, server price verification, refund policy, non-member path, and genuine Toss TEST window are demonstrated independently before requesting merchant reassessment.
4. No live charge, automatic payout, unapproved customer-data transfer, or automatic order dispatch occurs during underwriting.
5. File upload, representative address verification, and final resubmission remain human-account-holder steps, never automatically assumed complete.

## 2026-10-31 protected release continuity — independent worker-dispatch fix
- Root cause observed in the genuine convergence job of #7098: `deploy-education.yml` returned HTTP 422 because the required `release_sha` input was missing. The post-merge dispatch loop stopped before reaching `deploy-ekodibiz.yml`; the registered merchant homepage still lacked the phone in an Opera browser verification after merge.
- Owner-authored source PR #7103: `5265cf847c0624a185aceb5a2ed8263f06444d60` (closed, not merged; superseded).
- First-party EKODI protected recovery PR #7104, branch `ai/chatgpt/orch_recovery_5265cf847c0624a185aceb5a2ed8263f`, task `orch_recovery_5265cf847c0624a185aceb5a2ed8263f`.
- This **documentation-only owner-authored checkpoint** restarts genuine PR checks on the recovery branch after GitHub's bot-authored pull-request checks were `action_required`. The original executable source SHA must stay in ancestry, and all protected CI, merged-main SHA, guarded per-worker deployment, staging, production and public-page phone checks remain mandatory.
- The fix supplies Education's `release_sha` only from the verified protected main merge SHA; fail closed if main changed. EKODIBIZ site asset update is in the same reviewed change for independent Biz Worker release. No payment execution or customer data is enabled.

### Synchronized-main authentic CI checkpoint — 2026-10-31
- EKODI protected convergence updated PR #7104 with bot-authored main synchronization SHA `a0ccf8bf3df763b9b0fe9ec95dc9482e64918060` after the owner's regression correction passed on `4e1a4fd253215fb7707ca701da2fea43e22af400`.
- This documentation-only owner-authored checkpoint requests genuine checks on that synchronized release branch. No release policy, pricing, payment authorization, credentials, business identity, payment execution, customer records or infrastructure scripts are changed here.
- Release remains blocked until authentic green checks on the current head, exact protected CI provenance and staging + production phone verification. A later main advance requires a fresh protected synchronization; never paste fake check statuses.

## 2026-10-31 read-only merchant-underwriting gate
- Original source PR #7128 HEAD `34293bb2a17a77b5dd47e43cd8a6fa2db9915003` was superseded without merge. Official protected recovery is #7129, source branch `ai/chatgpt/orch_recovery_34293bb2a17a77b5dd47e43cd8a6fa2d`.
- A first-party read-only CLI and workflow inspect public merchant identity/phone, translations, Biz quote-only catalog and consultation basket with GET requests only.
- Protected `main` changes to this auditor trigger a single report; owner can rerun it with `workflow_dispatch`. Artifact is a JSON classification; a green GitHub job only means the audit ran, **not** that Toss accepted the application or payment works.
- Expected initial overall result is `blocked` while pricing/real sellable SKU and guest checkout are not independently validated. Never invent price, customer/reviewer credentials, completed purchase, test-payment window, representative residence or formal Toss approval.
- Merchant may manually add authenticated business documents only at Toss after verifying certificate business name/address; final `재심사 요청` remains the owner action.
- The evidence-preflight never posts purchase requests or touches settlement, and only EKODI Orchestrator handles protected merge and any release work.

## 2026-10-31 synchronized-main review-preflight check 6eafd026b774
- EKODI protected convergence synchronized PR #7129 with main at bot-authored SHA `6eafd026b7740fdbbb44a5f56ca18d4066d359e8`. GitHub's bot-created pull_request checks were `action_required` although the original owner changes passed genuine CI.
- This owner-authored **documentation-only** checkpoint requests authentic protected CI/AI checks on the synchronized branch; the source functional commit remains in ancestry.
- Never bypass protection, invent merchant SKUs/prices, activate live checkout or claim Toss reassessment. The read-only audit and its report are the only new capabilities until owner-supplied sales evidence is available.

## 2026-11-04 intangible-service underwriting screenshot release
- Original owner-authored source PR #8152, functional SHA `079f6cb9b40dd828328f731f05881769508acdf9`, was superseded (not merged) by the EKODI Orchestrator official PR #8153, head branch `ai/chatgpt/orch_recovery_079f6cb9b40dd828328f731f05881769`.
- Screenshot of EKODIBIZ (2131301959) Toss application checklist `/registration/reapply/9b7d96a0-1a27-41e0-ba2c-8460939cc67f/checklist` specifically requires service detail, **intangible service period and refund policy**, hiding empty sales categories, and guest card TEST payment window (or a non-social reviewer test credential for members-only stores). This is a **different onboarding application URL** from the previously reviewed October request; do not conflate or submit either automatically.
- Public merchant page now distinguishes eight informational business fields from sellable items; describes the actual `growth-30` quote-only marketing offer, its 30-day plan horizon, scope, agreed-by-contract execution term, and refund link. No fictitious list price, real checkout, test credentials or direct-sale of partner physical products is introduced. PC/mobile styles and a fail-closed read-only audit check were added.
- Production read-only Supabase evidence on 2026-11-04: `trade_product_public_profiles` has three products with `publication_status=draft, sale_status=preparing` and **zero** products with both a positive approved list price and a public Mall purchase URL. These cannot be represented as sale-ready.
- Source PR checked in genuine GitHub CI, but recovery PR initially has bot-created `action_required` checks. This owner-authored documentation checkpoint requests authentic protected tests and lineage verification; **does not bypass** branch protections, live payment, security policy, independent deployment or final user approval. Re-review stays withheld until a real card TEST window has been demonstrated for an approved product.

## 2026-11-04 progressive-home merchant visibility guard
- First-party source PR #8154, functional SHA `8104e6b43e86318cb1cc1b02e3ee57283e347678`, was automatically superseded by orchestrator official recovery PR #8155, branch `ai/chatgpt/orch_recovery_8104e6b43e86318cb1cc1b02e3ee5728`. Source and official branch have the same functional changes; do not bypass provenance.
- **Real Opera browser** verified on the initial approved deployment of #8153 that `https://ekodi.kr/ekodibiz` did **not** expose the new legal service terms on desktop, even with a cache-busting query parameter, despite a successful Worker release. Root cause: the shared `shell/progressive-home.js` hides every child section after the first two on desktop (after the first on mobile); the newly appended intangible service panel was behind the `더보기` toggle. Static HTTP deployment checks had missed the accessibility issue.
- The existing `shell/progressive-home.js` has an intentional per-site `data-ekodi-progressive-home=off` opt-out. Setting it in the EKODIBIZ `html` root exposes service facts by default **only on this merchant's homepage**, retaining common EKODI site behavior. The Biz protected production smoke now checks for this opt-out and the actual service period and refund text on the canonical URL.
- Documentation-only owner-authored checkpoint requests authentic CI after GitHub bot-generated PR actions had `action_required`, without forging or bypassing them. Confirm production and rerun actual Opera accessibility view after protected merge and guarded deploy.
- This is not a representation of approved sellable SKU or checkout: three trade products in production remain `draft/preparing`, and zero have approved price plus public checkout URL. No live money, credentials, or Toss submission.

## 2026-11-04 Mall registered homepage empty-category recovery
- Toss's authenticated EKODIBIZ checklist for `/registration/reapply/9b7d96a0-1a27-41e0-ba2c-8460939cc67f/checklist` lists **`https://ekodi.kr/ekodimall`** as merchant-review homepage. This application is distinct from an earlier `/registration/reapply/a1db9cdc-...` review; never conflate either with the public EKODIBIZ company homepage.
- Source PR #8158, functional HEAD `44b599648d5bdb1a3bd4c402eea98731987c14f1` was superseded without merge by official EKODI protected recovery PR #8159. This owner-authored documentation checkpoint re-triggers *authentic* CI on the approved official branch after bot-origin `action_required` checks; no checks or receipts may be forged.
- Verified production public Mall API `/ekodimall/api/api/public/products?limit=1&category=book` returned `{"products":[]}`. Production Supabase trade products were 3 draft/preparing and 0 with both approved price and public checkout URL. Empty sale categories must be hidden from Mall filters/shortcuts **only on verified public API success**, unhidden automatically when published products appear, and retained on upstream errors.
- New client script performs safe public GET requests and no payment/price/catalog mutation. Merchant homepage explicitly distinguishes direct checkout not yet enabled from external affiliate sellers; status does NOT prove card TEST checkout.
- Release evidence must include genuine native regression tests, built Mall asset, protected merge, independent deployment and live browser test. Never click Toss `재심사 요청` or add fictitious seller IDs, reviewer passwords, prices, products, travel category assertions, or new live payment permissions.

## 2026-11-04 Mall shared-header zero-sale category final guard
- The official Toss application for EKODIBIZ (2131301959) names `https://ekodi.kr/ekodimall` as the actual merchant homepage, not merely the EKODIBIZ information site.
- Real Opera browser inspection of the protected #8159 Mall production release showed the body category shortcuts and shop filters hidden, but duplicate empty category links remained in the common `.mall-primary-nav` header. The originally deployed script queried only `.mall-category-shortcuts [data-filter-target]`; common `mall-shared-header.js` renders a second matching nav.
- Source PR #8160 at `ab658ddcb3c49e8f0fbc2a42247dfe8b2c5a8c1f` is superseded without merge by EKODI Orchestrator recovery PR #8161, branch `ai/chatgpt/orch_recovery_ab658ddcb3c49e8f0fbc2a42247dfe8b`. The change reuses the same public GET category evidence to hide empty shared header links, adds CSS `[hidden]` specificity and expands Node VM tests. External affiliate travel links remain independent.
- This documentation-only owner checkpoint exists solely to trigger authentic protected CI on the official recovery branch after GitHub bot-origin `action_required` checks. It does not bypass governance, invent sellable products or rates, enable direct card payment, create reviewer accounts or send a Toss reassessment request.
- Final completion requires genuine protected merge, independent guarded Mall staging/production and **real browser** proof that the shared header hides a verified-empty sale category. Retain uncertainty on API failures.
