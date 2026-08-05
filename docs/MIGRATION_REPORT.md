# EKODI Platform v3 migration report

## Executive summary

The existing single-site Worker and authentication API have been converted into a cloud-first pnpm monorepo without removing the working administrative console, D1 identity data, verified legacy service links, monitoring, or Cloudflare Worker names. GitHub remains the source of truth and every application has an independent Cloudflare Workers deployment boundary.

## Preserved baseline

- Existing platform Worker name: `shy-thunder-39a4`.
- Existing operations API Worker name: `ekodi-auth-api`.
- Existing D1 database: `ekodi-auth` (`e38778f1-b059-4fe7-8816-300f3eec6e19`).
- Existing administrator authentication, domain registry, allow-listed DNS operations, audit history, and monitoring behavior.
- Verified legacy application URLs in the ecosystem catalog while content migration proceeds.
- Backup branch: `backup/pre-v3-monorepo-20260805` at the last pre-refactor commit.

## Target structure

- 15 applications in `apps/*`, mapped one-to-one to the requested `ekodi.kr` hostnames.
- Hono-based Worker API in `apps/operations-api`.
- Shared UI, authentication/RBAC, D1, validation, CMS, ERP, catalog, and site runtime packages in `packages/*`.
- Reusable Vite site compiler and availability monitor in `tools/*`.
- Canonical Cloudflare Builds matrix in `infra/cloudflare/projects.json`.

## Functional migration

- React, TypeScript, Vite, and Tailwind CSS now build the platform and every managed application.
- Korean is the default language; responsive layout, system dark mode, keyboard focus, skip links, reduced-motion behavior, and semantic landmarks are included.
- Public applications emit canonical metadata, Open Graph metadata, `robots.txt`, and `sitemap.xml`.
- `ekodi.kr` and `erp.ekodi.kr` require a valid shared session and emit `noindex`; ERP emits no sitemap.
- Published EKCMS content remains anonymously readable, while all draft, revision, media, and administrative operations require RBAC permissions.
- CMS data classification prevents internal, confidential, and restricted documents from being published anonymously.
- R2 media is private by default, restricts file type and size, and exposes only explicitly public assets.

## Quality and operations

- ESLint, TypeScript checking, Node test suites, Vite production builds, GitHub Actions CI, Dependabot, Codespaces, and Codex Cloud guidance are included.
- D1 migrations are additive and ordered; rollback procedures distinguish Worker rollback from D1 Time Travel.
- Production deploy commands run through Cloudflare Workers Builds. Feature branches use Worker version uploads for preview deployments.
- Secrets remain in Cloudflare encrypted secret storage; no credentials are committed.

## Verification record

- `corepack pnpm verify`: passed on 2026-08-06 (strict checks, tests, lint, and all production builds).
- Workspace validation: all application/domain/Worker mappings passed.
- Tests: authentication, RBAC, D1 contracts, CMS validation, media rules, ERP validation, platform access gate, CSP, private SEO, deployment manifest, and monitoring passed.
- Cloudflare runtime integration: one-time setup, session validation, RBAC, CMS draft/save/publish/revision flow, publication classification, and private/public R2 access passed against isolated Workerd D1/R2 bindings.
- Builds: platform plus all 14 generated application bundles passed; private ERP generated crawl blocking and no sitemap.
- GitHub Actions CI run `31018685949`: passed in 32 seconds.
- D1 migrations 0003–0006: applied to production database `ekodi-auth`; a follow-up list operation reported no pending migrations.
- Cloudflare bootstrap: all 14 new application Workers returned HTTP 200 with cache-busting requests; public SEO and ERP `noindex`/`Disallow: /` behavior were verified.
- Platform monorepo version `74f771bb-ba53-491b-a949-1e28ea857abb`: uploaded without promotion, preserving current production traffic.
- R2 discovery: Cloudflare returned `10042` and requires account-level R2 activation before the API Worker can be promoted.

## Remaining owner-controlled cutover

The following are intentionally outside repository authorization and require the Cloudflare/GitHub account owner:

1. Install or approve the Cloudflare GitHub application for all Workers Builds projects.
2. Confirm any R2 billing activation if the account has not previously enabled R2.
3. Attach the 15 custom hostnames after confirming domain ownership and DNS cutover timing.
4. Merge the pull request to `main`, which becomes the production deployment trigger.

No custom hostname is attached and no billing setting is changed by this migration branch.

The item-by-item implementation and authorization boundary is recorded in `docs/COMPLETION_AUDIT.md`.
