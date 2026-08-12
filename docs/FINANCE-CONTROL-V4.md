# EKODI Finance & Control Architecture V4.1

## 1. Domain principle

`ekodi.kr` is the canonical root of the EKODI ecosystem.

- `admin.ekodi.kr`: unified operations and monitoring console
- `pay.ekodi.kr`: common payment gateway
- `trade.ekodi.kr`: canonical EKODI Trading address
- `mail.ekodi.kr`: common mail lobby
- `live.ekodi.kr`: common live-broadcast lobby
- `cloud.ekodi.kr`: common workspace lobby
- `biz.ekodi.kr`, `mall.ekodi.kr`, `books.ekodi.kr`, `church.ekodi.kr`, `lab.ekodi.kr`: service and organization entry points

Historical nested addresses may remain only as compatibility redirects. `trade.biz.ekodi.kr` redirects to `trade.ekodi.kr`.

## 2. Control-plane separation

The admin screen is unified, but the server responsibilities remain isolated.

### api.ekodi.kr

- administrator authentication and sessions
- domain and DNS control through the existing advanced console
- service controls and 10-minute D1 health checks
- 24-hour availability and response-time statistics

### finance-api.ekodi.kr

- payment classification
- Toss payment synchronization
- accounting summaries
- organization/business-unit/project structure
- integration event history

A payment outage therefore does not disable administrator authentication or the primary service monitor.

## 3. Payment safety boundary

`pay.ekodi.kr` is a gateway, not a wallet and not a new PG company.

- Existing commercial payments are attributed to the actual contracted business entity.
- Toss server credentials are stored only as Cloudflare Worker secrets.
- No server secret is placed in HTML, browser JavaScript, GitHub source files, or browser storage.
- A Toss webhook is treated as a notification. Before changing the internal payment ledger, the finance Worker re-queries Toss using the payment key or order ID.
- If the production server secret is not configured, payment synchronization fails closed and `admin.ekodi.kr` explicitly shows the integration as not ready.

## 4. Accounting hierarchy

Every financial record uses an explicit scope:

`Organization → Business Unit → Project`

Examples:

- `EKODIBIZ → TRADE → GPU export project`
- `EKODIBIZ → MALL → campaign/project`
- `EKODIBIZ → BOOKS → publication/project`
- `EKODICHURCH → CHURCH → ministry/project`

A subdomain is a routing and service identifier. It is not, by itself, the accounting owner.

## 5. Separation of legal entities and funds

Sharing the `ekodi.kr` root must never merge legally distinct accounting books.

Commercial EKODIBIZ payments, church/ministry funds, research projects, and association funds remain explicitly separated by organization and require the appropriate contract, settlement account, evidence, and accounting treatment before live processing is enabled.

## 6. Monitoring visible at admin.ekodi.kr

The unified admin console combines three monitoring layers:

1. **D1 live service control** from `api.ekodi.kr`
   - active/planned/paused service state
   - manual immediate health check
   - 10-minute scheduled health check
   - 24-hour availability and response time

2. **Finance control** from `finance-api.ekodi.kr`
   - Toss readiness
   - recent synchronized payments
   - monthly revenue/expense/profit by organization and business unit
   - organization → business unit → project map
   - recent integration failures

3. **Full ecosystem external monitor** from `monitor-status.json`
   - root, admin, APIs, pay, mail, live, cloud, mall, biz, trade, marketing, local-commerce, publishing, church, lab, mission
   - status, HTTP result, response time, and check time
   - refreshed by GitHub Actions every ten minutes

The full-ecosystem monitor is intentionally independent of the finance API. If one data source is stale or unavailable, the other monitoring panels continue to function.

## 7. Deployment gates

Production deployment follows this order:

1. JavaScript syntax checks and automated tests
2. D1 migrations
3. primary API deployment
4. finance API deployment
5. Toss Worker secrets connected when GitHub production secrets exist
6. root/admin/pay/trade site deployment
7. live HTTP verification of canonical domains
8. scheduled external monitor refresh

A missing Toss secret does not block safe infrastructure deployment; it only keeps payment synchronization disabled.

## 8. Secrets expected by production automation

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- optional until live payment synchronization is enabled: `TOSS_PAYMENTS_SECRET_KEY`
- optional metadata: `TOSS_PAYMENTS_MID`

Secrets must be configured in GitHub Actions/Cloudflare secret storage and never committed to the repository.
