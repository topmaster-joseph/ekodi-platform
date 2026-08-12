# EKODI Control Center v4

## Principle

EKODI uses a balanced architecture:

- Separate first: every public service keeps its own domain, deployment, and failure boundary.
- Connect when useful: shared operational data flows through `api.ekodi.kr`.
- Manage together: authenticated operators use `admin.ekodi.kr` as the control center.

A public service must remain usable even when the control center or API is unavailable. The API is an operations and integration layer, not a mandatory reverse proxy for every visitor request.

## Roles

```text
ekodi.kr                 public ecosystem gateway
*.ekodi.kr               independent public services
api.ekodi.kr             authenticated integration and operations API
admin.ekodi.kr           authenticated control center
Cloudflare D1            control metadata, health history, audit history
Cloudflare Cron Trigger  periodic service health checks
```

## Control API

All `/api/control/*` endpoints require an authenticated administrator session.

- `GET /api/control/overview`
  - current service health
  - response time and HTTP status
  - 24-hour availability and response statistics
  - active, planned, paused, and monitored service counts
- `POST /api/control/check`
  - run an immediate health check for monitored active services
- `GET /api/control/services`
  - service catalog, operational state, notes, latest check, 24-hour statistics
- `PUT /api/control/services/:id`
  - update operational state, monitoring switch, and operator note
- `GET /api/control/services/:id/history?hours=24`
  - health-check history, up to seven days

Service URLs are defined in code rather than editable through the browser. This prevents the monitoring worker from becoming an arbitrary URL fetcher.

## Monitoring

The API Worker runs a Cloudflare scheduled job every ten minutes. It records checks in D1 and keeps 30 days of operational health history. The admin dashboard receives monitoring data through the API instead of reading the GitHub monitoring snapshot directly.

The existing GitHub monitoring workflow can remain temporarily as an independent fallback during migration. It should no longer be the admin dashboard's system of record after v4 is accepted.

## Service states

- `planned`: visible to operations but not treated as a production outage.
- `active`: live service. Monitoring can be enabled independently.
- `paused`: intentionally suspended service, not counted as an outage.

This distinction prevents undeployed future services from creating permanent false alarms.

## Data boundary

The first v4 increment manages operational metadata only. It does not yet centralize business data from each service.

Future adapters can add service-specific statistics without changing the public-service architecture, for example:

- Mall: orders, sales, payment failures, inventory alerts.
- Trading: inquiries, quotations, contracts, expected profit, receivables.
- Church: content publishing status, live-stream status, attendance or ministry metrics when an authoritative source exists.
- Books: titles, publication pipeline, downloads or sales when platform APIs are connected.
- Lab: projects, reports, deadlines, research outputs.

Each adapter should expose read-only statistics first. Write operations should be added only when authorization, validation, audit logging, and rollback behavior are defined.

## Failure boundary

`api.ekodi.kr` and `admin.ekodi.kr` must never become required dependencies for rendering `ekodi.kr`, `church.ekodi.kr`, `mall.ekodi.kr`, `books.ekodi.kr`, or other public services.

In short:

> Separate services, connected operations, unified management.
