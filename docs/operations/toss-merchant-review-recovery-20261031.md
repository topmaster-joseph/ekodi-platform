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
