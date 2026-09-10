# EKODI Discovery Layer

EKODI Discovery Layer is the shared public-discovery contract for SEO, AEO, GEO/LLMO, crawler policy, canonical URLs, and machine-readable entity metadata.

## Runtime outputs

The real `npm run build` path invokes `scripts/discovery-build.mjs` through `scripts/ccm-mr-postbuild.mjs` and emits or validates:

- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- canonical URL consistency on EKODI-owned static public pages
- Open Graph and Twitter discovery metadata on EKODI-owned static public pages
- Schema.org JSON-LD linking `Organization` → `WebSite` → `WebPage`
- canonical URL rewriting for the path-proxied EKODI Mall

`llms.txt` is a supplemental machine-readable discovery aid. It is not treated as a ranking standard and does not replace robots.txt, sitemap, canonical URLs, visible content, or structured data.

## Public-first, private-by-default boundary

Only explicitly declared canonical public routes belong in `DISCOVERY_PUBLIC_ROUTES`. Admin, auth, API, development-preview, tenant-private, and operational surfaces must never be added to the sitemap or LLM discovery source list.

Private prefixes are centralized in `DISCOVERY_PRIVATE_PREFIXES`. Admin and Mall operational routes also receive `X-Robots-Tag: noindex, nofollow, noarchive` at the edge.

## AI crawler policy

EKODI separates search discovery from model training:

- Public search/retrieval crawlers such as `OAI-SearchBot` and `PerplexityBot` may crawl public routes but remain blocked from private operational prefixes.
- Model-training controls such as `GPTBot`, `ClaudeBot`, and `Google-Extended` are disallowed by default.

Changing this policy is a governance decision, not a marketing toggle. Review privacy, copyright, citation, and discovery effects before changing crawler classes.

## AEO / GEO rules

1. Prefer visible, human-useful content over hidden search-only copy.
2. Keep canonical URLs stable and extensionless.
3. Structured data must describe entities and claims supported by public content.
4. Use stable `@id` values so answer engines can connect EKODI pages to the same Organization and WebSite entities.
5. Do not publish private tenant relationships, admin routes, credentials, internal APIs, or operational details as discovery metadata.
6. Add service-specific Schema.org types only when the corresponding public page and facts exist.
7. Add FAQ markup only when the same questions and answers are visibly present on the page.
8. Add `hreflang` only when real translated/localized page pairs exist.

## Validation

`test/discovery-layer.test.mjs` verifies the route allowlist, private-route exclusion, crawler separation, canonical source list, and Organization/WebSite/WebPage graph.

The production build itself fails when canonical, Open Graph, or JSON-LD markers are missing from EKODI-owned public pages. CI runs the same `npm run build`, so a Discovery Layer regression blocks the release path instead of silently shipping.
