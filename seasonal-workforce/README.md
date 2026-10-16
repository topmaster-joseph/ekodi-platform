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

## Production activation still blocked
The repository branch and PR are not a live release. Do **not** state that this URL is serving the portal until protected merge, deployment and external verification have succeeded.

Before live applications:
1. Verify lawful responsible municipal/public operator and formal data stewardship.
2. Implement actual EKODI identity-provider session validation and trusted tenant memberships. `verifiedMemberships` in the pure domain adapter is **not** a security token and must only originate from a server-side verified source.
3. Implement authenticated persistence, cross-tenant RLS/D1 access, audit, idempotency and rate limiting with tests.
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
