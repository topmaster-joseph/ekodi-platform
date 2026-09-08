# EKODI Discovery Layer

EKODI Discovery Layer is the shared public-discovery contract for SEO, AEO, GEO/LLMO, crawler policy, and machine-readable entity metadata.

## Runtime outputs

The guarded shared-site build emits:

- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- Open Graph metadata on the public homepage
- Schema.org JSON-LD for the EKODI Organization and WebSite entities

The source contract is `discovery-layer.js`. `scripts/discovery-build.mjs` emits and validates the deployment artifacts during the existing shared-site build pipeline.

## Public-first, private-by-default boundary

Only explicitly declared canonical public routes belong in `DISCOVERY_PUBLIC_ROUTES`. Admin, auth, API, tenant-private, and operational surfaces must never be added to the sitemap or LLM discovery source list.

Private prefixes are centralized in `DISCOVERY_PRIVATE_PREFIXES` and are emitted to the generic/search crawler groups in `robots.txt`.

## AI crawler policy

EKODI separates search discovery from model training:

- Public search/retrieval crawlers such as `OAI-SearchBot` and `PerplexityBot` may crawl public routes but remain blocked from private operational prefixes.
- Model-training controls such as `GPTBot`, `ClaudeBot`, and `Google-Extended` are disallowed by default.

Changing this policy is a governance decision, not a marketing toggle. Review privacy, copyright, citation, and discovery effects before changing crawler classes.

## AEO / GEO rules

1. Prefer visible, human-useful content over hidden search-only copy.
2. Keep canonical URLs stable and extensionless where the platform canonicalizes HTML assets.
3. Structured data must describe entities and claims that are supported by public content.
4. Do not publish private tenant relationships, admin routes, credentials, internal APIs, or operational details as discovery metadata.
5. Add service-specific Schema.org types only when the corresponding public page and facts exist.
6. Treat `llms.txt` as a machine-readable discovery aid, not as a guaranteed ranking mechanism.

## Validation

`test/discovery-layer.test.mjs` verifies:

- sitemap public-route allowlisting
- private-route exclusion
- search-vs-training crawler separation
- canonical LLM discovery references
- public-only Organization/WebSite structured data

The production build also fails if expected discovery artifacts or JSON-LD markers are missing.
