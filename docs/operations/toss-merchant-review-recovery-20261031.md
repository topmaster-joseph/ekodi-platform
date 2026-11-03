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
