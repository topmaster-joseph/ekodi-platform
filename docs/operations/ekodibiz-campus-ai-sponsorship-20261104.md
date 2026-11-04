# EKODIBIZ — 대학 3개월 개인 AI 구독 대납 사전검증 및 금융위원회 법령해석

- task_id: `campus-ai-preflight-20261104-2050`
- status: **NON-PRODUCTION EXPERIMENT — NO CHARGES ENABLED**
- legal entity: **EKODIBIZ only** (not church, mission, or merchant association)
- legal state: **FSC PG / BOK FX / tax / vendor approval unresolved**. A portal receipt is not a permit.

## Intended contract flow
1. University signs a 3-month supply or mandate contract with EKODIBIZ and pays its contracted funds.
2. The user keeps ownership of their personal AI account. EKODIBIZ never collects passwords, OTPs or conversations and never forces personal/workspace data mergers.
3. EKODIBIZ may pay individually only if the AI provider **approves the exact third-party-billed personal account plan in writing**, applicable Korean PG/FX/tax rules are cleared, university funds have settled, and the authorized payment core is configured.
4. Charges are controlled by university budget, user consent, unique subscription identity, audit receipts and human approval. Before a fourth charge, a verified vendor cancellation must be obtained.
5. At end of support, the personal account survives, paid features may end, and the user may choose independent billing with provider support. Never promise portability of institutional chat content without vendor confirmation.

## Contract classifications to present to regulators
**A. Supply**: EKODIBIZ purchases compliant vendor licensing and sells an own-name service to the university.

**B. Agency**: university instructs EKODIBIZ to pay overseas AI providers for its individual constituents. Naming B 'supply' does not remove registration obligations. Determine whether this is PG payment collection/settlement, foreign-exchange third-party payment, and how invoice and refunds work.

## Minimum risk controls

| Area | Release evidence required |
|---|---|
| Contract & funding | University agreement, effective dates, number of users, reconciled cleared funds |
| Vendor authorization | Written permission covering consumer account, payer and monthly cancellation; permitted technical integration |
| Personal security | Individual consent, account ownership, no password/OTP, no forced workspace merge |
| Legal | FSC PG classification, BOK FX position, tax/invoice review |
| Payment | Cap before FX/fees, no duplicate charges, gateway receipts, audit trail; separate EKODIBIZ ledgers |
| Continuity | No account deletion, end notice, cancellation proof, independent billing option |
| Release | Explicit human payment approval and EKODI orchestrator guarded release |

## Current implementation
- `ekodibiz-campus-ai-preflight.js` is a pure preflight assessor that emits blocker codes only.
- It **always** returns `allowCharge:false`; a clean dossier is `REVIEW_REQUIRED`, not payment authorization.
- `proposeThreeMonthBillingSchedule` returns illustrative dates only. Actual provider billing anchors and cancellation lead time prevail.
- It neither stores PII, account details, cards or bank accounts, nor connects to a gateway.
- Tests: `node --test test/ekodibiz-campus-ai-preflight.test.mjs`.

## FSC formal legal interpretation application — pending authentication/submission
Applicant: EKODIBIZ (business identity and applicant authority to be authenticated in the official portal).

Subject: Whether receipt of 3 months' university funds and monthly payment of foreign consumer AI subscriptions for individuals is electronic payment gateway business.

Questions:
1. Under Electronic Financial Transactions Act Article 28 and upcoming amended PG definition, is this own-supply, purchasing agency, or third-party payment/settlement?
2. Which criteria distinguish direct vendor sublicense procurement from payment/settlement on behalf of individual subscribers?
3. What registration, settlement-fund controls and record obligations apply to each structure, with transition dates?
4. What impact do refund, cancellation, unspent funds, prepaid university funds versus university postpayment have?
5. What supporting signed contract/flow documents should be provided, and what other regulator should assess FX issues?

Submission: https://better.fsc.go.kr/ . Only the portal's successful submit response and issued reception number count as a formal application; an email asking for directions is not a filing receipt.

## Browser / authority boundary
EKODI native Chromium currently enforces `config/background-browser-worker-policy.json`: canonical `ekodi.kr` only and blocked non-idempotent HTTP by default. The owned Windows connector in `docs/EKODI-NATIVE-BROWSER-CONNECTOR.md` is read-only. It cannot be repurposed to submit `better.fsc.go.kr` without proper reviewed authority. No cookie copying, bypass or unapproved third-party browser fallback. A regulator login requires a sanctioned human-authenticated path.

## Next requirements
Written vendor payment approval; FSC and BOK replies; college procurement eligibility; real user consent and university contract templates; cyber/privacy threat review; verified synthetic university tenant and finance segregation; controlled staging once governance authorizes it.

**Release invariant:** task branch MUST NOT merge directly to main; orchestrator-approved `orch_` provenance and real production functional verification are required. A PR or test result does not mean the live service exists.
