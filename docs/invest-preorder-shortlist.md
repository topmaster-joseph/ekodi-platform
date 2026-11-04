# EKODI Invest — pre-order short-horizon research shortlist

Task: `invest-preorder-research-shortlist-20261104`

## Purpose and trust boundary
The owner has asked to use AI for candidate research and recommendations **before** any live broker order. This first bounded iteration connects the existing `screenShortTermValue` deterministic research engine to `/invest/my/value`. It does not add a new backend, grant extra investment authority, or activate real/paper orders.

- The owner pastes `{"candidates":[...]}` JSON with up to 30 Korean stock observations. Nothing is auto-discovered or fetched by the new UI.
- The existing server API `POST /v1/invest/autopilot/research/short-term-value` requires verified owner login, an EKODI step-up session and Supabase TOTP AAL2. Body maximum is 128 KiB; the new form limits input to 120,000 characters. The API and score engine are not changed by this task.
- Input observation metadata `quoteProvider: "kis"` and `financialProvider: "opendart"` is **caller supplied**, not proof the source was independently verified. Results carry `dataBasis: caller_supplied_unverified`; per-row `executionEligible:false`.
- The result is **research review priority only**, not price targets, expected returns, buy/sell instructions, live quotes or financial advice. Scores cover relative valuation, quality, revisions, trend and execution risk. Low liquidity, wide spreads, stale quotes, incomplete financial data and unresolved material risks cause exclusions.
- Existing backend `live/orders` is hard-locked HTTP 423; UI never calls the broker order endpoint. No new DB writes, keys or recommendation subscriptions.
- Current quote freshness policy is 24 hours; financial filings 220 days. Neither is proof of a market forecast.

## Initial user workflow
1. Sign in and complete EKODI step-up plus Supabase TOTP AAL2.
2. Visit `https://ekodi.kr/invest/my/value`; check provider readiness and official OpenDART disclosures separately.
3. In **AI 후보 순위 분석 · 검증 전 연구**, paste structured observation JSON (no credentials, account details or personal data).
4. Select **연구 후보 비교 (주문 없음)**. Review categorized candidates and excluded reasons.
5. Study official provider records independently. User may use `/invest/my/manual` to create an **untransmitted draft**, or use the official broker site for discretionary manual orders. No automatic live orders.

## What is not yet implemented
- Official KIS market quotes/volume/spreads and official DART fundamentals **aggregated and independently attested** into the scorer.
- Automated discovery/universe ingestion and exchange of company code versus stock ticker, sector benchmark valuation and earnings revision feeds.
- Historical out-of-sample recommendation accuracy, alerts/watchlists persisted server-side, advisory suitability and portfolio exposure adjustment.
- Any broker execution permission, live broker order API, personal risk acceptance, guaranteed gains.

All of the above require separate connected, provenance-tested source contracts and validation before a UI may label candidates **verified recommendations**. If official live data is unavailable, display `자료 부족 / 검증 전 연구 후보`, not invented candidates or profits.

## Release verification
- Existing server endpoint AAL2 guard and research-only response contract unchanged.
- Node regression: all short-value engine/runtime UI tests, owner route boundaries and account authorization tests.
- Isolated Chromium on 320/390/768/1366/1440: no horizontal overflow, no script errors, table and exclusions render, no order actions.
- EKODI central orchestrator only: protected CI, guarded review/merge, MY Worker production deploy and real owner canary. Do not claim operational deployment merely because the worker PR or test passed.
