# EKODI Customer Value Master Plan

Date: 2026-08-25
Status: execution baseline

## 1. Identity

EKODI is not a catalog of platforms. It is an ecosystem that helps a person or organization discover, connect, and execute the next meaningful step.

EKODIBIZ is the business execution layer of that ecosystem. It does not sell AI modules first. It starts with a customer's actual problem, proposes the next action, connects the right resource, records the result, and earns when real value is created.

Core loop:

`Situation → Problem → Next Action → Execution → Result → Value → Payment → Next Step`

## 2. Customer value rule

EKODI should earn at the point where the customer can recognize value.

- Diagnosis and problem discovery: free or very low friction
- One-off execution: action-based fee
- Repeated execution: managed subscription
- Measurable revenue/cost outcomes: optional performance-based fee
- Successful human/provider connection: transaction or matching fee
- Organization-wide use: enterprise license

The first commercial sequence is:

`Free diagnosis → Action payment → Repeat use → Subscription → Performance/transaction revenue`

## 3. North-star metric

The primary KPI is **Value Created**, not page views, AI chat count, or feature usage.

Value Created should eventually combine:

- incremental revenue attributable to an executed action
- verified cost savings against a baseline
- time saved by delegated or automated work
- completed next actions
- successful connections or transactions

Until actual data is connected, the interface must display no fabricated values.

## 4. Phase 1: EKODIBIZ customer gateway

Target: `business.ekodi.kr` / `biz.ekodi.kr`

First-screen question:

**사업하면서 지금 가장 해결하고 싶은 것은 무엇인가요?**

Initial problem choices:

1. 매출을 늘리고 싶어요
2. 단골을 늘리고 싶어요
3. 홍보를 맡기고 싶어요
4. 비용을 줄이고 싶어요
5. 사람이 필요해요
6. 잘 모르겠어요. 한번 봐주세요

The customer does not select CRM, Marketing AI, Finance AI, or Work AI. Those tools become backstage services chosen by EKODI according to the problem.

Primary CTA:

**에코디가 해주세요**

The CTA does not bypass safety controls. It first checks the action policy. External messaging, spending, contracts, employment decisions, and other high-impact actions remain human-approved or human-only.

## 5. Phase 2: Jadam vertical pilot

Pilot workspace: `자담치킨 목포대점`

The generic problem language becomes store-specific:

- 오늘 매출이 걱정돼요
- 단골을 다시 부르고 싶어요
- 홍보할 시간이 없어요
- 전기료·비용이 많이 나와요
- 사람이 필요해요
- 우리 매장을 전체적으로 봐주세요

Initial validated tracks:

### A. Revenue and repeat visits

Use read-only order/customer aggregates first. Identify whether acquisition, repeat visits, channel mix, or operational friction is the most likely priority. Do not claim causal impact without measurement.

### B. Marketing execution

Connect the existing private Jadam Marketing AI workspace. Move from content idea generation toward an approval-based execution flow and measure completed posts/campaigns and customer response.

### C. Energy and cost

Use the existing Jadam Mokpo Energy AI pilot. Start with electricity bill baseline analysis, then connect AMI/time-of-use data, and only later optional circuit measurement. Physical control stays disabled until explicit bounded-control requirements are met.

### D. People and providers

Start with requirement definition and human-reviewed posting/matching. Expand later to trusted local specialists and service providers.

## 6. Thirty-day pilot

### Week 1: baseline

- connect only the minimum real data required
- establish sales/repeat/marketing/energy baselines
- record current operating burden and time spent

### Week 2: first actions

- execute one repeat-customer action
- execute one marketing action
- complete one electricity-cost diagnosis

### Week 3: measure

- record customer response, revenue signal, cost signal, and time spent
- separate observed facts from estimates
- collect store-owner feedback on willingness to pay

### Week 4: payment test

Test real willingness to pay with a small action-based offer. Do not begin with a broad subscription.

Decision question:

**이 결과를 다음 달에도 돈을 내고 계속 사용하시겠습니까?**

## 7. Initial revenue experiments

These are test ranges, not fixed prices.

| Customer outcome | Initial monetization hypothesis |
| --- | --- |
| Basic diagnosis | Free |
| Repeat-customer campaign preparation/execution | Action fee |
| Marketing execution pack | Action fee |
| Cost/energy detailed diagnosis | Diagnostic fee |
| Continuous managed execution | Monthly managed fee |
| Verified savings or revenue contribution | Optional performance share |
| Provider/worker connection | Matching or transaction fee |

Pricing is validated by actual purchase behavior, not by internal preference.

## 8. Next Engine data model

The common model across EKODI should eventually contain:

- Person / Organization
- Workspace / Business
- Situation
- Problem
- Next Action
- Approval state
- Execution
- Result
- Value Created
- Payment
- Next Step

The strategic data asset is not generic chat history. It is the accumulated relationship between **situation → action → result**.

## 9. Expansion rule

Do not build a marketplace, subscription catalog, or many vertical products before the first loop is proven.

Expansion gate:

1. Was a real problem found?
2. Did the customer act?
3. Was a result observed?
4. Did the customer pay?
5. Did the customer return?

Only after these are repeatedly true should the pattern be copied to another store, brand, or EKODI domain.

## 10. Root EKODI evolution

Do not redesign `ekodi.kr` first.

After EKODIBIZ and Jadam validate the problem-first model, evolve the root from a platform catalog into a Next Step Gateway:

**지금 당신에게 어떤 다음 단계가 필요하세요?**

Possible routes:

- 사업의 다음 단계 → Biz
- 일과 커리어의 다음 단계 → Work
- 연구와 배움의 다음 단계 → Lab
- 거래와 시장의 다음 단계 → Trade
- 신앙과 공동체의 다음 단계 → Church / Community
- 지식과 콘텐츠의 다음 단계 → Books / Creator

The root should inherit a proven interaction model, not impose an unvalidated concept on the whole ecosystem.

## 11. Execution order

1. Change EKODIBIZ first screen to problem-first UX.
2. Keep authentication, tenant isolation, and human-approval safety boundaries intact.
3. Connect Jadam as the first vertical workspace.
4. Run the 30-day Jadam Mokpo pilot with real data.
5. Add Value Created ledger and payment evidence.
6. Replicate only the behaviors that produce paid customer value.
7. Redesign `ekodi.kr` after validation.

## 12. Non-negotiable principles

- No fabricated business metrics.
- No high-impact autonomous decisions.
- No feature-first homepage as the primary customer journey.
- No subscription-first monetization before value is demonstrated.
- No ecosystem-wide redesign before the first customer loop is validated.
- Every new feature must answer: **Which customer problem does this solve, what next action does it enable, and how will the result be measured?**
