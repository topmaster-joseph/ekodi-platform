# EKODI Research — Shared Site Core route release continuity

Task: EKODI Research guarded public path release (follow-up to PR #5091 / recovery PR #5121).

## Verified failure and cause
- The Education Worker was deployed through guarded run [38989516972](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38989516972) for official merged commit `35f2d62f756ef95dca4a0e94dd20496fa135760b`.
- The user-facing `https://ekodi.kr/research/` was observed displaying the pre-existing workspace page, not the EKODI Research website. No claim of public route completion is warranted.
- `platform-route-registry.js` was updated by the merged Research PR with `/research` -> `EDUCATION`, but the common `scripts/converge-orchestrated-pr-merge.mjs` release predicate `sharedSiteTouched` omitted this source path. A merge through GitHub Actions `GITHUB_TOKEN` does not trigger ordinary `push` workflows.
- The `deploy-site-core.yml` push paths already include the route registry; the official release convergence predicate needs the matching path.

## Minimal source change
- Add precisely `platform-route-registry.js` to the existing, receipt-bound `sharedSiteTouched` scope. No new domain, service, auth realm, database table or payment capability.
- Add static contract regression tests for both auto-merge dispatch and direct main-push ownership.

## Guards
- This modifies a common release orchestration script and therefore MUST follow the full EKODI Human Gate for an approved exact source SHA. Do not mark owner approval or assert deployment automatically.
- Existing `EKODI AI Orchestration Gate`, required genuine CI, parallel conflict guard, staged and guarded production deployment, auto-rollback and live route verification remain mandatory.
- The script's normal self-change predicate may also dispatch other guarded shared-release workflows. Check actual scope, cost and safety before approval.
- Acceptance needs the exact `https://ekodi.kr/research/` landing page, `/research/health`, `/research/api/diagnosis`, empty-state project CRUD (synthetic non-sensitive only), hidden consultation intake, and PC+mobile viewport checks with real EKODI-owned Chromium.
