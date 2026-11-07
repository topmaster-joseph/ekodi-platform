# EKODIBIZ — AI 서비스 구매·결제 위탁 계약 (2026-11-06)

Task: \`issue-8421-ekodi-ai-ai\` · Issue #8421 · PR #8422
Owner / merchant of record: EKODIBIZ.
Client route: \`https://ekodi.kr/ekodibiz/ai-agency/apply\`
Operator route: \`https://ekodi.kr/ekodibiz/ai-agency/manage\` (admin API protected by the existing server key).

## Scope
- Customer-selected 1–120-month integer contract terms for institution and individual requests, with no preselected duration. Legacy 1/3-month records remain unchanged.
- Customer submits a **request for quote**, not an immediate subscription purchase.
- Operator confirms provider permission and contract scope, then quotes separate EKODIBIZ service fee and optional supplier subscription collection.
- Customer must accept the specific quoted price and contract terms before checkout.
- Only EKODIBIZ's existing authorized Toss Payments merchant profile can confirm payment. No supplier/PG credentials are exposed to a client.
- After PG confirmation: **paid / pending fulfillment**, not active. Service term begins only when the operator confirms actual supplier activation.
- No billing key or stored card. No auto-renewal. EKODIBIZ management expiry does not prove the supplier has cancelled an independent subscription.
- Supplier credentials/passwords are **never** requested or stored.

## Settlement and permission boundaries
Separate both charges clearly in quotes. If a customer pays a supplier directly, \`supplierAmount=0\`.
Collecting the supplier's subscription fee under EKODIBIZ merchant account requires explicit provider authorization to resell/collect and PG merchant-scope approval; otherwise it stays disabled.
The owner reported verbal permission from PG and supplier; that is useful intake context but does not itself flip production flags.
Any material legal/financial commitment remains behind EKODI human sovereignty gates.

## Operations and environment configuration (no secrets committed)
The Worker shares the existing \`REVENUE_STORE\` Durable Object. This is **operational state**; canonical contract/receipt archival into the approved EKODI Storage Gateway must be completed before financial activation.
- \`AGENCY_ADMIN_KEY\`: secret at least 32 characters; required for private read/quote/activation API. Until centralized EKODI admin capability integration is verified, treat it as a transitional operator gate and do not broaden access.
- \`EKODIPAY_PROFILE\`: existing EKODIBIZ-authorized profile; default \`ekodi\`.
- \`PAYMENTS_ENABLED=true\` plus matching Toss \`TOSS_CLIENT_KEY\` and \`TOSS_SECRET_KEY\` (or profile-specific key mapping); use test keys in staging.
- \`AGENCY_PG_SCOPE_VERIFIED=true\`: only when the precise service category and MID are recorded as approved.
- \`AGENCY_SUPPLIER_COLLECTION_VERIFIED=true\`: only if collecting supplier subscription fees is expressly authorized (not needed for service-fee-only quotes).
- \`AGENCY_LIVE_ENABLED=true\`: final guarded production release switch after contract evidence, admin authorization, archive/audit readiness and live merchant credentials are independently checked.

All unset configuration values fail closed. Application intake can remain enabled without payment.

## Workflow
1. \`POST /api/agency/apply\` requires integer \`months\` (1–120) and returns request ID and one-time display of a confidential receipt token. Store that token safely; no password is collected.
2. \`POST /api/agency/status\` returns only the caller's request when ID + token hash match.
3. Operator \`POST /api/agency/admin/list\`, \`/quote\`, \`/activate\` require private server-side admin key; never put that key in GitHub or URLs.
4. \`POST /api/agency/accept\` records customer approval of the quoted service and money amount.
5. \`POST /api/agency/checkout\` checks the configured merchant profile and scope; price and order ID come from stored server data.
6. Toss V2 widget redirects to the same-origin receipt page, which calls \`POST /api/agency/confirm\`. The server verifies order ID and amount and calls Toss \`/v1/payments/confirm\` with a server-side secret and idempotency key.
7. Operator confirms that the supplier enabled the service, starting the selected-month management term.

## Before production claim
- Execute \`node --test test/ekodibiz-ai-agency.test.mjs\`; run main PR CI and EKODI AI orchestration gate.
- Inspect \`/ekodibiz/ai-agency/apply\`, \`/ekodibiz/ai-agency/university\`, \`/ekodibiz/ai-agency/individual\`, \`/ekodibiz/ai-agency/manage\`, \`/ekodibiz/ai-agency.js\`, \`/ekodibiz/api/agency/health\` on the **real** hostname.
- Exercise the complete customer quote and staging Toss test-key flow; intentionally tamper with amounts, IDs and tokens and assert rejection.
- Verify authorized EKODI administrator login integration or protected transition plan, personal-data retention and canonical Shared Drive archive receipts. Check provider-specific contract permission, PG MID scope, refund and tax documentation before final live switch.
- Do not infer real money movement merely from a page rendering, CI success or user verbal approval.

## Rollback
Revert the owning EKODIBIZ release through guarded workflow; set \`AGENCY_LIVE_ENABLED=false\` to stop new charges immediately. Retain verified payment/audit records and reconcile any in-flight Toss orders before structural changes.

## 2026-11-08 variable month contract / labels

EKODI issue [#8791](https://github.com/topmaster-joseph/ekodi-platform/issues/8791): Customers supply any whole month count from 1 to 120 (technical cap) without a default for institutions or individuals. Contract lookup is titled **계약 담당자** while retaining the compatible `/university` URL. Company operator administration is titled **업체 관리자** at `/manage`. Read-only monthly evidence/CSV uses the recorded term; older 1/3-month records are left intact. Live provider payment, direct supplier collection, regulator/provider permissions, card/OTP handling, and provider subscription cancellation are unchanged and approval-gated. The updated operational runbook is `docs/operations/ekodibiz-simple-3month-payment-mandate-20261106.md`.
