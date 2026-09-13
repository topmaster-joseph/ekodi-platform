# EKODI Discovery Layer

EKODI Discovery Layer is the shared public-discovery contract for SEO, AEO, GEO/LLMO, crawler policy, canonical URLs, and machine-readable entity metadata.

Its security model is **Discovery Secure Projection**:

`Canonical Data -> Authorization -> Secure Projection -> Discovery Projection -> Public Web / Search / Answer Engines`

Discovery never widens authorization. Only information already intended for unrestricted public publication may enter the discovery projection.

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

Private prefixes are centralized in `DISCOVERY_PRIVATE_PREFIXES`. Admin, API and Mall operational routes use `X-Robots-Tag: noindex, nofollow, noarchive` where they cross the public edge. Authentication and other private hosts must remain non-discoverable independently of robots.txt.

`robots.txt` is crawler guidance, not a security boundary. A URL that must remain private requires authorization and/or an explicit noindex response, and restricted fields must be removed before serialization.

## Purpose-bound crawler policy

EKODI separates four crawler purposes rather than treating every AI bot alike:

- **Search index**: `Googlebot`, `bingbot` — allowed on explicitly public routes for SEO.
- **Answer retrieval/search**: `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Applebot` — allowed on explicitly public routes for AEO/GEO and citation/search retrieval.
- **Model training / AI crawling**: `GPTBot`, `ClaudeBot`, `Google-Extended`, `Google-CloudVertexBot`, `Bytespider`, `CCBot`, `meta-externalagent`, `FacebookBot`, `Amazonbot` — disallowed by default.
- **Autonomous/user-agent fetchers**: `ChatGPT-User`, `Claude-User`, `Perplexity-User`, `meta-externalfetcher`, `DuckAssistBot`, `MistralAI-User` — disallowed by default unless EKODI later creates a separately governed agent-access contract.

Search permission never implies training permission or autonomous-agent permission. Changing these classes is a security/governance decision, not a marketing toggle.

`Google-Extended` is deliberately denied as a training/grounding control token while ordinary `Googlebot` remains allowed for Google Search. This preserves normal search indexing while taking the stricter position on Gemini model use; Gemini-specific grounding reach may therefore be narrower than Google Search reach.

## Edge enforcement

Robots rules alone cannot stop spoofed or non-compliant scrapers. EKODI therefore keeps the same intent at the Cloudflare edge:

- Search: **Allow** (`ai_search=disabled`, meaning no Cloudflare search-blocking rule)
- Training: **Block** (`ai_training=block`)
- Agent/User: **Block by default** (`ai_user=block`)
- legacy AI crawler protection: **Block** (`ai_bots_protection=block`)
- Cloudflare-managed robots and Bot Preference Sync: **Off**, because EKODI generates the canonical robots policy itself
- unknown/unverified high-volume automation: handled independently by bot/WAF/rate controls

`scripts/enforce-cloudflare-discovery-policy.mjs` resolves the production `ekodi.kr` zone, reads the existing Bot Management configuration, refuses to proceed if verified bots are globally blocked, applies only the purpose-bound discovery controls, verifies the resulting state, and attempts rollback of changed fields on verification failure.

`.github/workflows/cloudflare-discovery-policy.yml` validates the contract on pull requests and enforces it only from `main` using production Cloudflare credentials after the EKODI orchestration gate. The workflow then rechecks the live `robots.txt`, sitemap and `llms.txt` endpoints so an edge-policy change cannot silently erase discovery.

Use Cloudflare verified/provider-managed bot classification where available. Do not treat a self-declared User-Agent string as sufficient proof of crawler identity.

## Discovery projection data rules

Discovery outputs may contain public titles, summaries, organization/service descriptions, published articles, public product/menu/service facts, public events, canonical URLs, breadcrumbs and Schema.org structured data derived from the same public facts visible to people.

Discovery outputs must not contain secrets, reusable credentials, private contact details, canonical internal identifiers, raw customer records, private files, repository/branch names, infrastructure topology, private API endpoints, prompts, orchestration state, audit payloads or non-public operational metadata.

Structured data must never be used as a hidden channel for facts that are not supported by the human-visible public surface.

## AEO / GEO rules

1. Prefer visible, human-useful content over hidden search-only copy.
2. Keep canonical URLs stable and extensionless.
3. Structured data must describe entities and claims supported by public content.
4. Use stable `@id` values so answer engines can connect EKODI pages to the same Organization and WebSite entities.
5. Do not publish private tenant relationships, admin routes, credentials, internal APIs, or operational details as discovery metadata.
6. Add service-specific Schema.org types only when the corresponding public page and facts exist.
7. Add FAQ markup only when the same questions and answers are visibly present on the page.
8. Add `hreflang` only when real translated/localized page pairs exist.
9. Measure organic search and AI-answer referral traffic separately so discovery benefit can be increased without weakening the security boundary.

## Validation

`test/discovery-layer.test.mjs` verifies the route allowlist, private-route exclusion, crawler-purpose separation, canonical source list, and Organization/WebSite/WebPage graph.

The production build itself fails when canonical, Open Graph, or JSON-LD markers are missing from EKODI-owned public pages. CI runs the same `npm run build`, so a Discovery Layer regression blocks the release path instead of silently shipping.
