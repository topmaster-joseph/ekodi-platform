# EKODI Control Plane

## Purpose

`admin.ekodi.kr` is the EKODI ecosystem control center. `api.ekodi.kr` is the shared connection layer used by the control center and selected services. Public services remain independently deployable and must not require the control plane to render their normal public pages.

## Core principle

**Separate first. Connect when useful. Manage centrally.**

- `ekodi.kr`: ultra-light public gateway
- `*.ekodi.kr`: independent ministry, business, knowledge, media and commerce services
- `api.ekodi.kr`: connection and operations API
- `admin.ekodi.kr`: authenticated control center

A failure in `api.ekodi.kr` or `admin.ekodi.kr` must not take down the public root portal or independent service sites.

## Control center capabilities

### 1. Service health

For every registered service, progressively expose:

- online / degraded / offline / unknown
- HTTP status
- last successful check
- response latency and recent trend
- deployment/version metadata when available
- DNS/custom-domain state when available
- SSL/custom-domain warnings when available

### 2. Statistics

Statistics are added only when a real source exists. No fabricated metrics.

Examples:

- visits and traffic trends
- content counts and publishing activity
- orders, payments and refunds
- sales and settlement summaries
- trading quotations, contracts and expected margin
- book/catalog activity
- ministry/event participation where a source system exists

### 3. Operations

- service registry
- domain and DNS metadata
- environment/deployment status
- incident and warning history
- audit log
- backups and recovery status
- scheduled jobs and automation status

### 4. Safe modification

The admin UI may change data only through authenticated API endpoints with validation, authorization and audit logging.

Changes should be divided into risk classes:

- low risk: labels, metadata, display settings
- medium risk: service configuration, publishing controls
- high risk: DNS, authentication, payment, destructive actions

High-risk changes must require stronger confirmation and leave an immutable audit event.

### 5. Integration adapters

Each service owns its own operational data. The control plane reads it through adapters rather than forcing every service into one database.

Examples:

- Cloudflare adapter: DNS, Workers, custom domains, analytics
- GitHub adapter: deployments, commits, workflow health
- Supabase/database adapters: service business data
- payment adapter: payment/settlement data
- Google adapters: Workspace, Drive, Calendar when authorized
- YouTube/media adapters: channel/content statistics when authorized

## Data ownership rule

A single giant database is not the goal.

Each domain keeps a clear system of record. `api.ekodi.kr` aggregates and orchestrates only what the admin control center needs.

This avoids tight coupling and lets individual services move technologies later without rebuilding the entire ecosystem.

## Reliability rule

Public read paths must not depend synchronously on the control plane.

- Root portal: static/edge cached
- Public services: independently deployable
- Monitoring: asynchronous
- Analytics collection: asynchronous where possible
- Admin aggregation: may degrade gracefully if one adapter is unavailable

The admin dashboard should show partial data with a clear status instead of failing as one large page.

## Security rule

- least-privilege credentials
- secrets never shipped to browsers
- authenticated admin access
- role-based access when multiple operators are introduced
- audit every security-sensitive write
- explicit CORS allow-list
- no direct browser access to infrastructure credentials
- backups and recovery procedures documented

## Growth path

### Foundation

1. service registry
2. health/monitoring API
3. unified admin dashboard
4. deployment and domain status
5. audit log

### Operational integration

6. traffic/usage analytics
7. content and publishing status
8. commerce/payment summaries
9. trading/ERP summaries
10. automation/job status

### Mature ecosystem

11. role-based administration
12. notifications and incident management
13. unified search
14. reporting and executive dashboards
15. selective cross-service identity and shared services only where justified

## Architectural contract

Every new EKODI service should answer these questions before integration:

1. What is its canonical domain?
2. What system owns its data?
3. Can it operate if the control plane is unavailable?
4. What health signal can it expose?
5. What metrics are meaningful and authoritative?
6. What operations should be read-only versus writable?
7. What permissions are required?
8. What audit trail is required?

This contract is the default architecture for the EKODI ecosystem.
