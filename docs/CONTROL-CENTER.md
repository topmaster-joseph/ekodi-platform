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

## Admin UI principles

These rules are the source of truth for the Admin presentation layer. Feature-specific UI and CSS may refine them, but must not weaken them.

1. **Readability before density.** Default Admin copy is at least 15px with approximately 1.5 line-height. Inputs on narrow or mobile layouts use at least 16px text. Essential labels and statuses must not depend on tiny text.
2. **Large, predictable controls.** Primary and secondary actions are at least 40px high. Navigation and mobile touch targets should be 44 to 48px where practical.
3. **Clear information hierarchy.** Use page title → section title → control label/body → supplemental metadata. Do not use color alone to communicate priority or state.
4. **High-contrast working surfaces.** Prefer a light neutral page background, white working panels, readable dark text, and clearly visible borders and focus states. Muted text must remain legible.
5. **Forms are explicit.** Inputs, selects, and textareas require a visible label or accessible name, visible keyboard focus, readable borders, and clear success/error copy. Avoid placeholder-only instructions.
6. **Tables favor scanning, not compression.** Use readable cell padding and headers. Allow wrapping or switch to stacked/mobile presentation rather than shrinking important text into narrow columns.
7. **Operator language, not implementation language.** Prefer plain statuses such as `준비 완료`, `연결됨`, `확인 필요` over internal enums or developer terminology. Korean Admin screens avoid unnecessary English.
8. **Primary task first.** Put the operator's next action and current state above diagnostics. Advanced, debug, provider, and implementation details remain secondary or demand-loaded.
9. **Status is redundant by design.** Pair color with text, badge, or icon so status remains understandable without color perception.
10. **Responsive without squeeze.** Essential controls and content must not be horizontally clipped. Mobile forms use 16px or larger text and expand controls to full width when that improves operation.
11. **Accessibility is part of done.** Keyboard focus, semantic headings, accessible names, and non-hover-only critical actions are required.
12. **Readability must preserve the thin shell.** Styling and UX improvements must not pull heavy feature runtimes, service maps, diagnostics, or AI orchestration into startup.
13. **Release-gated.** Admin UI changes must pass build/CI and the guarded Admin production gate before promotion.

### UI rule management

- This section is the canonical Admin UI rulebook in source control.
- When a design decision materially changes these principles, update this section in the same change so documentation and production UI do not drift.
- Feature-level exceptions must be intentional, documented near the feature, and must not reduce accessibility, security, responsiveness, or startup performance.
- New Admin subservices should inherit these principles by default rather than introducing a separate visual system.
