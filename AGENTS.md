# EKODI Platform Engineering Constitution

EKODI Platform is not a demo site collection. It is a revenue-oriented Agentic AI operating platform intended to support recurring commercial services. Every change must protect trust, availability, tenant isolation, data integrity, and future monetization.

## 1. Product identity

- `ekodi.kr`: EKODI front door.
- `admin.ekodi.kr`: private control plane and operational command center.
- `api.ekodi.kr`: shared control/data API layer.
- `marketing.ekodi.kr`: Marketing AI platform hub.
- Short first-level customer domains are canonical customer entry points.
- Service-specific details belong in URL paths or product configuration, not increasingly deep public subdomains.

## 2. Customer classification is a business invariant

Only EKODI-owned brands are internal.

Internal examples:
- EKODI Biz
- EKODI Church
- EKODI Lab
- EKODI Books
- EKODI Trading
- other brands owned by EKODI

Every non-EKODI organization is an external client even when closely partnered with EKODI.

Revenue-critical external clients currently include:
- `cgma.ekodi.kr` — 청계면상인회
- `jadam.ekodi.kr` — 자담치킨 목포대점
- `pizzamaru.ekodi.kr` — 피자마루 목포대점
- `yogurt.ekodi.kr` — 요거트퍼플 목포대점

Do not silently reclassify these tenants.

## 3. Production invariants

A production change is incomplete until all applicable checks pass.

- No redirect loops.
- No broken canonical domain.
- No customer domain reassignment without explicit intent.
- No client-side exposure of provider credentials, API secrets, payment secrets, DNS tokens, or privileged service keys.
- Admin pages must keep restrictive security headers and `Cache-Control: no-store`.
- Revenue-critical customer domains must remain monitored.
- Production endpoint verification must test the real public hostname, not only a build artifact or Pages preview URL.
- A successful deploy command alone is not proof of a successful release.
- Any routing, DNS, auth, payment, customer-domain, or control-plane change requires regression coverage.

## 3A. Platform isolation is a production invariant

EKODI sites are independent platforms or specialized services, not cosmetic pages inside one release unit.

- A normal source change must deploy only the platform that owns that source.
- The coordinated full-ecosystem deployment workflow is manual-only.
- Every platform-specific deployment workflow must use explicit path filters.
- Shared edge runtimes must be treated as shared infrastructure and require regression checks across every domain they serve.
- Do not add a platform-specific source file to a shared runtime when an isolated Worker, Pages project, module, or API contract can solve the problem.
- Shared database changes are shared-core changes. Name migrations by functional area and preserve table/tenant namespaces.
- Platform-specific code must not directly access another platform or tenant's private data. Use an explicit shared API contract.
- Changes to `site-worker.js`, `service-proxy.js`, shared auth, shared payment, or shared database infrastructure require an explicit impact review before deployment.
- Keep `platform-boundaries.json` and `docs/PLATFORM-ISOLATION.md` accurate when a platform's ownership, domain, data store, or deployment unit changes.

## 4. Definition of done

For business-critical changes, “done” means:

1. Source validation passes.
2. Automated tests pass.
3. Deployment succeeds.
4. Real production hostname returns the expected status and content.
5. Redirect behavior is explicitly verified when routing changes.
6. `admin.ekodi.kr` can observe the resulting service state.
7. Security and tenant boundaries remain intact.
8. Failure is visible through monitoring or operational logs.

Never report a feature as complete merely because code was committed.

## 5. Agentic AI architecture direction

The platform should evolve from a link dashboard into an action-oriented control plane:

`observe → diagnose → propose → approve → execute → verify → audit`

Examples:
- detect a customer-site outage
- identify DNS/deployment/application cause
- prepare the safest repair action
- require approval for destructive or financially sensitive actions
- execute through server-side privileged integrations
- verify the production result
- record an immutable audit event

Agent actions must be scoped by tenant and role. High-impact actions must never be hidden behind vague automation.

## 6. Multi-tenant direction

External customers are independent tenants, not cosmetic page variants.

Each tenant should be able to own independent configuration for:
- identity and branding
- domain
- enabled products
- channels and integrations
- content and approval workflow
- analytics
- billing/subscription
- users and roles
- audit history

Shared infrastructure is encouraged, shared customer data is not.

## 7. Monetization direction

Design new capabilities so they can map cleanly to commercial packaging, for example:
- Marketing AI
- content generation and approval
- channel publishing
- analytics/reporting
- CRM/customer engagement
- live/media operations
- managed domain/hosting
- premium automation/agent actions

Avoid one-off customer code when a configurable product capability can solve the same problem.

## 8. Release discipline

Prefer small reversible releases over large opaque changes.

Before changing production routing or authentication:
- inspect the current implementation and live configuration
- identify rollback behavior
- add or update regression tests
- deploy
- verify the real domain

When an incident occurs, find and fix the root cause. Do not instruct users to clear cookies or perform local workarounds unless evidence shows the browser is actually the cause.

## 9. Current automated safeguards

The repository contains business contract tests, a Production Revenue Gate, and platform-boundary validation. Do not weaken or bypass them to make a deployment green. Fix the underlying defect.

## 10. Quality bar

Optimize for a platform a paying customer can trust. Visual polish matters, but correctness, clarity, speed, security, observability, maintainability, and measurable customer outcomes come first.
