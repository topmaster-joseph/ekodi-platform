# EKODI Invest — Research-to-manual-draft and future paper-order handoff

Task: `invest-research-manual-paper-handoff-20261104`

## Purpose

An EKODI owner may inspect unverified short-value research rankings in `/invest/my/value`, select a candidate for a **manual trade draft**, or place it on an **AI paper review queue**. A research score is not an order, endorsement or prediction of gain. This change intentionally leaves all brokerage execution paths and the HTTP 423 live-order lock unchanged.

## Existing research gate

- Only the authenticated Invest owner may access the personal workspace, after EKODI step-up. The research POST endpoint already requires Supabase TOTP AAL2 and owner status.
- `POST /workspace-api/v1/invest/autopilot/research/short-term-value` returns `dataBasis:'caller_supplied_unverified'`, non-executable ranking rows and `ordersPlaced:false`, `paperOrdersPlaced:false`, `liveOrdersEnabled:false`, `autoOrderSubmission:false`.
- Source identifiers embedded in caller JSON are not signed provider attestations. Any ranked stock may be stale or incorrect. The UI explicitly warns that no automatic buy/sell recommendation exists.

## Candidate handoff contract (in-memory only)

```json
{
  "schema": "ekodi.invest.research-handoff.v1",
  "source": "short_value",
  "stage": "MANUAL_REVIEW",
  "symbol": "005930",
  "score": 76.45,
  "decision": "priority_review",
  "dataBasis": "caller_supplied_unverified",
  "providerAttested": false,
  "executionAuthorized": false,
  "autoOrderSubmission": false,
  "side": null,
  "quantity": null,
  "limitPriceKRW": null,
  "createdAt": "ISO-8601"
}
```

The same schema with `stage:'PAPER_REVIEW'` can represent an AI paper candidate once independent provider verification is implemented. **It is not yet a paper order and must never be cast as one.** Handoff lives in tab memory only; never in URL, sessionStorage/localStorage or a persisted order table.

## Manual investment (available UI workflow)

1. Owner requests a fresh short-value research analysis under MFA.
2. A ranked row meeting basic format and research classification requirements shows **직접투자 초안** and **AI 모의검토** actions. Excluded/low-confidence rows do not enable a handoff.
3. Choosing **직접투자 초안** navigates to `/invest/my/manual` and copies **only the six-digit stock symbol** into `manualSymbol`.
4. The form resets direction, quantity and limit price to blank. The user must explicitly choose BUY or SELL and enter an independently checked quantity/limit price. It is a **non-submitting calculation only**.
5. Actual order authentication, market quote, order confirmation and execution take place at the broker's official website, with the user's own final approval. EKODI never sends an order from this flow.

## Future AI trade progression

Research priority → independently provider-attested quote/financial/corporate-action records → verified signal + historical out-of-sample evidence → owner-reviewed paper candidate → risk-engine-approved paper order → at least 60 days of compliant paper evidence → live broker terms/permissions/API testing and owner suitability → separate explicit live approval → centrally signed production release.

Before live execution, preserve all existing gates: strong AAL2, account ownership, independent quotes, issuer mapping and settlement, provider authorization, fresh prices, risk limits, duplicate-order idempotency, kill switch, accurate costs and audit trail. Do not enable `LIVE_ACTIVE`, alter the KIS broker read-only adapter to a trading adapter, or bypass `LIVE_EXECUTION_LOCKED` as part of this task.

## Validation and release acceptance

- Node tests cover legitimate handoffs, invalid/unauthenticated states, blank side/qty/price, no broker POST, 6-digit symbols, deletion on research refresh and loss of auth.
- Isolated Chromium smoke on 320, 390, 768, 1366, 1440px with stubbed research API verifies click-through from ranking to manual and paper review, no overflow/JS error, no order requests.
- The EKODI Orchestrator must run constitutional/security/concurrency gates, stage and release MY Worker through protected recovery, and verify live authenticated owner UI plus anonymous API boundary. No agent merges or deploys directly.
