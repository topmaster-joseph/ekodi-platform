# EKODI 계절근로자 운영관리 포털 — 개발 현황

Canonical route (after protected release): `https://ekodi.kr/ekodibiz/seasonal-workers/`.

## Implemented in this PR
- Canonical apex Worker route registered in `platform-router-entry-worker.js`.
- Public Korean-language introduction with clear **demonstration only** labeling.
- Responsive browser-only farm demand **simulation** at `/ekodibiz/seasonal-workers/survey-demo`, including printable calculation of person-month demand.
- First-party external JavaScript module so the demo works under a restrictive script CSP.
- `/api/*` intentionally returns `503 applications_not_enabled` for every method. **No server-side submission, database write, enrollment, fee collection or official placement occurs.**
- Pure input-validation/aggregation module, tenant-authorization domain adapter, non-applied SQL proposal, and automated unit/route test files.
- Narrow GitHub Actions check workflow (`.github/workflows/seasonal-workforce-check.yml`). Its execution and passing status must be independently verified.


## Inactive municipal operations screen
- `/ekodibiz/seasonal-workers/office`: responsive public shell, **private information loads only from the authenticated API** after explicit operator assignment.
- `/ekodibiz/seasonal-workers/office.js`: same-origin API client, protected `sessionStorage` admin token convention, farm-demand plan input, list and administrative review.
- Login builds `/auth/?site=admin&return_to=` from the **current full office URL**, preserving nested path and query; it never redirects intentionally to My EKODI.
- Office browser UI cannot create operator/municipal authorization or turn on the Worker feature flag. With the current OFF flag it displays a preparation message and does not save records. Audit logs are stored only after formal activation.
- Client-side editing uses safe DOM `textContent` for untrusted API data; there are no external scripts, trackers, ID/passport fields, worker placement controls or payment buttons.
- `test/seasonal-workforce-office.test.mjs` and `test/seasonal-workforce-operations.test.mjs` cover browser script syntax, scoped API behavior and default-deny policy.

## Inactive municipal planning API added (code only)
- `/ekodibiz/seasonal-workers/api/v1/tenants/{slug}/demands` supports GET/POST, and `/demands/{id}` supports GET/PATCH **only if activated by the official operator**.
- `/ekodibiz/seasonal-workers/api/v1/tenants/{slug}/statistics` aggregates administrative demand counts.
- All API requests return `503 applications_not_enabled` when `SEASONAL_PORTAL_OPERATIONS_ENABLED` is absent or not exactly `true` (current production default).
- The new D1 SQL is located at `schemas/ekodibiz/seasonal-workforce-inactive.sql`, **not** in `migrations/` and has **not** been applied. The original `schema-proposal.sql` is a separate Supabase design alternative and must not be executed automatically.
- Even with the runtime flag enabled, an explicitly activated `seasonal_tenants` record and a separately active `seasonal_operator_roles` membership are mandatory. The D1 schema seeds neither.
- API mutation actions require verified EKODI admin identity, same-origin Origin, a rate limiter, strict bounded inputs, tenant scoping, D1 batch audit, version check and idempotency ID. The current phase does **not** provide farmer self-service or a public intake endpoint.
- `approved` is an internal demand-review status only, not official worker allocation, employment approval, visa issuance or immigration clearance.

## Production activation still blocked
The repository branch and PR are not a live release. Do **not** state that this URL is serving the portal until protected merge, deployment and external verification have succeeded.

Before live applications:
1. Verify lawful responsible municipal/public operator and formal data stewardship.
2. Implement actual EKODI identity-provider session validation and trusted tenant memberships. `verifiedMemberships` in the pure domain adapter is **not** a security token and must only originate from a server-side verified source.
3. Execute approved D1 migration and authorized tenant/operator provisioning under the official release gate. The draft private API's membership, audit and version checks must be verified with real D1 and real authenticated admin accounts.
4. Confirm legal notice/consent, retention/deletion rules, role provisioning and incident response.
5. Complete municipality, farm and document management UIs and protected APIs. Government recruitment, selection, visa and allocation remain outside EKODI authority.
6. Run workflow checks, platform constitutional gates, staging, PC/mobile authenticated Chromium tests and rollback drill via EKODI official orchestrator.
7. Obtain required production-release gate approval.

## Smoke test after staging
- `GET /ekodibiz/seasonal-workers` -> 308 to trailing slash
- `GET /ekodibiz/seasonal-workers/` -> demo HTML and noindex/no-store
- `GET /ekodibiz/seasonal-workers/survey-demo` -> HTML including same-origin script
- `GET /ekodibiz/seasonal-workers/survey-demo.js` -> JavaScript
- `POST /ekodibiz/seasonal-workers/api/v1/demands` -> 503 with `applications_not_enabled`
- Unexpected nested routes -> 404, non-apex origin -> 403

## Public-sector + international design implementation (2026-10-17)
The source image mockups are **design references**, not official municipal branding, live data or signed intergovernmental agreements. The implemented pages deliberately use EKODI BIZ branding and show explicit public-sector **proposal-only** labeling instead of using an unlicensed municipal seal.

**Canonical public paths** (all anonymous, noindex, non-persistent, server writes disabled):
- `/` — public-sector proposal homepage, international cooperation illustration and seven service tiles
- `/demand` — anonymous farm demand **calculator** (crop, count, start, duration, housing, interpretation; browser only)
- `/office` — existing authenticated municipal-office prototype, now with the consistent header/design. API remains OFF
- `/mou` — document taxonomy, local-only category filters, template preview, review checklist; **no fabricated active MOUs**
- `/learning` — orientation/education course directory mockup and local self-checklist; **not official training completion**
- `/housing` — no-storage housing safety checklist
- `/entry` — administrative procedure overview, no visa/placement decisions
- `/help` — rights/grievance FAQ, **not a complaint intake**
- `/reports` — zero-placeholder verified statistics and browser-only person-month calculator
- `/survey-demo` — preserved original anonymous demonstration form for backward compatibility

The new shared `theme.css` and `public.js` source files are mirrored byte-for-byte in `public-assets.mjs` for text serving by the canonical Worker. CI asserts asset parity; do not edit one without regenerating the other. Static illustration uses CSS and no external trackers or outside service dependencies.

**Design guardrails:** No simulated government approval, fake local statistics, imaginary national MOU signatures, state emblems, legal authorization, data ingestion, worker personal details or cross-border recruitment. The applicant-facing forms still do **not** accept or retain real applications. Existing auth return URL and fail-closed D1 gate are unchanged.

