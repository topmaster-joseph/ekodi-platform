# EKODI Discovery Secure Projection

Status: proposed common security/discovery boundary

## Purpose

EKODI must be discoverable without exposing canonical internals. Public search and answer surfaces receive only a purpose-bound public projection. Training crawlers, unknown scrapers and automation that does not need canonical data are denied or challenged at the edge.

Canonical chain:

`Canonical Data -> Authorization -> Secure Projection -> Discovery Projection -> Public Web / Search / Answer Engines`

Discovery Projection is narrower than ordinary application access and can never widen authorization.

## Bot intent classes

- `search-index`: public search indexing and snippet generation; allow on explicitly public routes.
- `answer-retrieval`: retrieval for answer/search products; allow only against public discovery projections.
- `training`: foundation-model training or bulk corpus collection; deny by default.
- `agent`: autonomous browsing/actions; deny by default unless a separately authorized agent contract exists.
- `unknown-scraper`: challenge or deny by default.

## Data rules

Discovery outputs may include public titles, summaries, public organization or service descriptions, published articles, public product/menu/service facts, public event facts, canonical URLs, breadcrumbs, structured data and other information already intended for unrestricted publication.

Discovery outputs must not include secrets, reusable credentials, private contact details, canonical internal identifiers, raw customer records, private files, internal repository or branch names, infrastructure topology, private API endpoints, prompts, orchestration state, audit payloads or non-public operational metadata.

`robots.txt`, meta robots and structured data are discovery instructions, not security boundaries. Restricted data must be removed before serialization and protected by application authorization and edge enforcement.

## Search / answer / training separation

EKODI permits search and answer discovery only where the corresponding route is public and the projection is explicitly generated for public discovery. Training access is separately governed and defaults to deny. Search access must not imply model-training consent.

## Surface defaults

- public pages: `index,follow` unless the site administrator explicitly disables discovery.
- authenticated/private/member/admin pages: `noindex,nofollow,noarchive` and must not appear in public sitemaps.
- API/raw/export/download endpoints: not indexable; authorization remains independent from page-view permission.
- synthetic Experience/Developer public content: indexable only when the published content is intentionally public and contains no internal topology.

## Structured discovery

Where meaningful, public pages should expose schema.org JSON-LD derived only from the same public projection shown to users. Structured data must not contain hidden private facts that are absent from the human-visible public surface.

## Edge enforcement

Cloudflare or the active edge provider should enforce bot-intent policy using verified-bot identity when available. Unknown or unverifiable crawlers must not be trusted solely because of a User-Agent string. Rate limits, anomaly detection and WAF rules remain independent defenses.

## Governance

Changes that widen discovery data, permit training crawlers, expose new public route classes or relax edge enforcement are security-sensitive and require the normal guarded review and deployment path.

## Verification invariants

1. Private/admin/authenticated routes never appear in public sitemaps.
2. Discovery projection never includes fields denied by Secure Projection.
3. Public structured data is derived from public projection only.
4. Search/answer crawler permission never implies training permission.
5. Training and unknown scraper access are denied by default.
6. `robots.txt` is never treated as the sole protection for private data.
7. Public pages remain usable by people when all crawler access is disabled.
