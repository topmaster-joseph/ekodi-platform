# EKODI Journal

## Purpose
`journal.ekodi.kr` is the registered public boundary for EKODI's common journal and living-record service. It is not a tenant or workspace hostname. Person, organization, group and project journals remain canonical under their `ekodi.kr/{namespace}/{slug}` space when those surfaces are introduced.

## Public contract
- Home: `https://journal.ekodi.kr/`
- Article: `https://journal.ekodi.kr/p/{slug}`
- JSON summaries: `GET /api/posts`
- JSON article: `GET /api/posts/{slug}`
- RSS: `GET /feed.xml`
- Sitemap: `GET /sitemap.xml`
- Health: `GET /health`
- Editorial handoff: `/admin` -> `https://admin.ekodi.kr/journal`

## Content model
The first production release uses Git-versioned reviewed editorial content in `journal-content.js`.
This deliberately keeps reading independent from an AI provider or external CMS. Future authoring storage may move to an EKODI-controlled `journal_*` namespace without changing the public URL or article IDs.

## Editorial rhythm
Recommended baseline:
- short field note when there is a meaningful event,
- one considered article each week,
- one monthly EKODI review,
- no automatic public posting of sensitive, private, unverified or tenant-owned material.

## Values
Every article may be tagged with one or more interpretive values such as Ecclesia, Koinonia, Diaspora, Jubilee, stewardship, agency, portability, and trust.

## Release
Journal source has its own Worker, staging Worker, production workflow, manifest, smoke checks and real-host verification. A journal source change does not require a shared-site deployment.

## Canonical paths and reviewed-photo safeguards (2026-11-03)
The first-party public entry is `https://ekodi.kr/journal/`; older hosts above are compatibility-only until guarded retirement.
Posts remain reviewed, Git-versioned content. There is **no production-persisted administrator editing or photo upload** enabled by the display support below.

Reviewed article sources may declare `coverPhoto` and `{ type: 'photo', photo: { ... } }` blocks. Public rendering requires all of:
- First-party assets under `/journal/media/` with JPEG, PNG, WebP or AVIF extensions.
- A meaningful `alt` (200 characters maximum), with optional caption and credit.
- Explicit `rightsStatus: 'verified'` after editorial verification of copyright, permission, privacy and consent.

Missing or invalid media fail closed and are never exposed. Photo intake, audit evidence, administrator role validation, draft storage, approvals and scheduled publication require separate guarded work; this change does not silently authorize publication.
