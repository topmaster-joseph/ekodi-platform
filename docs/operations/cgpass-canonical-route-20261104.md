# EKODI CGPASS canonical route release checkpoint — 2026-11-04

Task: `cgpass-canonical-20261104`. Repository: `topmaster-joseph/ekodi-platform`. Worker: Shared Site / guarded Site Core.

## Approved route contract

| Surface | Canonical | Historic routes (HTTP 308) |
| --- | --- | --- |
| Public Cheonggye Pass | `https://ekodi.kr/cgpass` | `/cheonggyepass`, `/cheonggye/pass` |
| Pass admin | `https://ekodi.kr/cgpass/admin` | `/cheonggyepass/admin`, `/cheonggye/admin/pass` |

The internal program ID `cheonggye-pass`, D1 tenant/grant identities, regional operator `cgma`, `/api/local-access/cheonggye-pass/me`, and private vendor intake `/api/cheonggyepass/vendor-intake` do **not** change. A short public path is not a new domain, API, tenant, authorization realm or financial approval.

The new public URL carries a self canonical. Legacy GET/HEAD paths redirect 308 with query strings preserved; API requests and unrelated paths are not redirected. Admin markup carries noindex and continues to enforce scoped authentication. Source URL, client and management nav, service catalog, authorizing scope metadata, browser surface registry, and Shared Site Worker-first matcher all point to CGPASS.

An idempotent D1 migration changes only the historic site/tenant domain text for `cheonggye-pass`, preserving all IDs and grants. Runtime preregistration repairs only known old aliases. The static site catalog ensures the shared publication controls follow the same site ID, not a duplicate tenant. Independent organization paths `/cgma` and `/cheonggye` remain unchanged.

## Technical verification / acceptance

1. Node tests: `node --test test/cgpass-canonical-migration.test.mjs test/regional-commerce-program-contract.test.mjs test/local-region-platform.test.mjs test/local-region-access.test.mjs test/local-region-enforcement.test.mjs test/cheonggyepass-native-browser-contract.test.mjs test/cheonggyepass-vendor-intake.test.mjs test/search-exposure-registry-20261019.test.mjs`.
2. Run repository governance, syntax, CI, conflict guard, security and protected release checks.
3. Only the orchestrator-issued `ai/<agent>/orch_*` release may merge and deploy; never merge a task branch directly. Stage first, then guarded production promotion.
4. Verify actual `/cgpass` 200, title/H1/canonical and public content; `/cgpass/admin` 200 with login handoff, scoped auth and noindex; all four legacy routes 308 to the correct canonical (query retained); `/api/local-access/cheonggye-pass/me` stays protected; `/api/cheonggyepass/vendor-intake` still denies unauthenticated access.
5. Confirm live `/public-registry.json` and `/sitemap.xml` advertise new canonical exactly once and no legacy URL; observe role boundaries, 320/390/768/1366/1440 px layout, no unintended error spikes. Only then mark production verified.

## Separate Mokdae-Humun issue

`/mokdaehumun` is currently the shared EKODI space landing page, **not** a dedicated public homepage for the registered `mokdaehumun` live tenant (name: 목대후문 자율상권조합). Its live path is `/mokdaehumun/live/`. The operator-space screenshot displays the logged-in account's selected store and must not be treated as the tenant's public identity. Do not invent or publish a new cooperative site, alter its customer grants or remove its noindex until an approved dedicated public surface exists. Treat it independently from CGPASS.

Status at authoring: implementation and local verification only; no production deployment or search-engine indexing claims.
