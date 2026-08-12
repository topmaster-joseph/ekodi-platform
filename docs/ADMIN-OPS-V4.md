# EKODI Control Plane V4

## 1. Canonical domain policy

- `ekodi.kr`: public ecosystem root.
- First-level functional subdomains such as `admin.ekodi.kr`, `pay.ekodi.kr`, `mail.ekodi.kr`, `live.ekodi.kr`, and `cloud.ekodi.kr` are shared gateways or control planes.
- First-level service subdomains such as `biz.ekodi.kr`, `trade.ekodi.kr`, `mall.ekodi.kr`, `books.ekodi.kr`, `church.ekodi.kr`, and `lab.ekodi.kr` are canonical service addresses.
- Deeper historical addresses can remain as compatibility redirects. `trade.biz.ekodi.kr` redirects to `trade.ekodi.kr`.
- `admin.ekodi.kr` is the primary control center. Scoped admin aliases remain available for compatibility and context, but do not create separate control databases.

## 2. Control-plane isolation

### Authentication plane

- Host: `api.ekodi.kr`
- Worker: `auth-worker.js`
- Responsibilities: administrator login, sessions, audit records, domain registry, Cloudflare DNS controls.

### Operations plane

- Host: `ops-api.ekodi.kr`
- Worker: `ops-worker.js`
- Responsibilities: service health, payment ledger synchronization, accounting summaries, organization/business-unit/project structure.
- Uses the same D1 database only for shared identity/session lookup and integrated reporting, while remaining a separate Worker deployment.
- A payment integration failure must not prevent administrator authentication.

## 3. Payment boundary

- Public gateway: `pay.ekodi.kr`.
- Payment credentials are server-side secrets only. They must never be embedded in HTML, JavaScript, repository files, or browser storage.
- Toss webhook events are treated as notifications, not as the sole source of truth. The operations Worker re-queries the Toss Payments API with `paymentKey` or `orderId` before updating the internal payment ledger.
- If the Toss server secret is absent, payment synchronization fails closed and the admin dashboard reports that the integration is not ready.
- A payment is classified independently from the visible domain using `organization_id`, `business_unit_id`, `project_id`, and `source_domain`.

## 4. Accounting hierarchy

`Organization → Business Unit → Project`

Examples:

- `EKODIBIZ → TRADE → specific export project`
- `EKODIBIZ → MALL → campaign/project`
- `EKODIBIZ → BOOKS → publication/project`
- `EKODICHURCH → CHURCH → ministry/project`

Domain names are routing identifiers, not accounting entities. Accounting ownership is always explicit in the ledger.

## 5. Separation rule

Commercial payment and accounting data for EKODIBIZ must not be mixed with church or nonprofit funds merely because all services share the `ekodi.kr` brand root. Each legally distinct organization requires its own valid payment contract, settlement account, evidence, and accounting classification before live payment processing is enabled for that organization.

## 6. admin.ekodi.kr monitoring scope

The V4 dashboard monitors or exposes:

- Root and gateway availability.
- Public service health and response time.
- Authentication and operations API readiness.
- Toss server-key readiness and webhook endpoint.
- Recent synchronized Toss payments.
- Monthly revenue, expense, and profit by organization/business unit.
- Organization, business-unit, and project structure.
- Direct access to the existing advanced DNS/domain/audit console at `/legacy`.

The legacy GitHub monitor also checks API `/health` endpoints and the expanded EKODI service set every ten minutes.

## 7. Deployment order

1. Validate JavaScript and tests.
2. Apply D1 migrations.
3. Deploy authentication and operations Workers.
4. Deploy root, admin, pay, trade, mail, live, and cloud gateway routes.
5. Verify live health endpoints and canonical domains.
6. Keep Toss synchronization disabled until the production server secret is present.

This order keeps schema changes ahead of code that depends on them and prevents a partially configured payment integration from masquerading as a healthy one.
