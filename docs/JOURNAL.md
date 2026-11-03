# EKODI Journal

## Purpose
`https://ekodi.kr/journal/` is the canonical public boundary for EKODI's common journal and living-record service. The legacy Journal host is a compatibility alias, not a new tenant or workspace hostname. Person, organization, group and project journals remain canonical under their `ekodi.kr/{namespace}/{slug}` space when those surfaces are introduced.

## Public contract
- Home: `https://ekodi.kr/journal/`
- Article: `https://ekodi.kr/journal/p/{slug}`
- JSON summaries: `GET /journal/api/posts`
- JSON article: `GET /journal/api/posts/{slug}`
- RSS: `GET /journal/feed.xml`
- Sitemap: `GET /journal/sitemap.xml`
- Health: `GET /journal/health`
- Editorial handoff: `/journal/admin` -> `https://ekodi.kr/admin/journal`

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

## Administrator review-only editor (2026-11-03)
`/admin/journal` reuses the existing EKODI Admin shell and `engine-professional` audience classification. The Journal detail is available within the existing common services panel, not through a new tenant menu or authentication system.

- A verified central `super_admin` session is required before presenting the editorial workspace.
- The editor reads public Journal articles and lets an authorized editor revise title, introduction, plain-text structured body, and optional first-party cover photo metadata.
- The **Review file** command exports a local JSON packet (`ekodi-journal-editorial-review-v1`) on an explicit user click. It records the original post revision, keeps all output private, always requires review, and **never** publishes or writes to the server.
- Newly entered photo rights always remain `pending` regardless of form input. Approved first-party photos may only appear in public content after the independent rights, privacy, editorial approval and guarded publication process.
- The initial review-only version did not provide server storage. The subsequent private-draft implementation below adds gated draft **create/read/update**, but still does not approve rights, upload images, or publish automatically.

## Phase 2: private D1 editorial draft persistence (guarded rollout)
This phase reuses the existing EKODI central Control API/D1 and `/api/session` authority; it does not add a new login, repository or tenant menu.

- `GET /api/journal/editorial/drafts` lists private review-draft summaries; `GET /api/journal/editorial/drafts/{slug}` fetches a complete private packet.
- `POST /api/journal/editorial/drafts` saves a new private packet or an optimistic-concurrency revision. Only a verified central `super_admin` with a valid Bearer session may read/write; POST requires canonical first-party Origin and JSON input.
- The server independently reconstructs every packet and forces `visibility=private`, `publishApproved=false`, `state=review_required`, and photo `rightsStatus=pending` even when clients falsify publication or rights approvals.
- New D1 tables `journal_private_editorial_drafts` and `journal_private_editorial_audit` are additive. Save and audit use a shared D1 transaction; editor identity is stored as a SHA-256 hash, not a duplicated raw email. Draft revision conflicts return HTTP 409; unavailable schema returns HTTP 503 without leaking SQL.
- Public Journal endpoints, RSS, sitemap, existing approved photo projection, and the Git-reviewed source of published articles remain unchanged.
- Required before considering this active in production: official CI approval of migration and Control API changes, staging D1 migration/test, guarded production rollout, and a verified authorized-admin read/write round trip. An unauthenticated 403 check alone cannot establish functionality.
- Public publishing, rights approval, bulk photo uploads, scheduled posting and an external publication service are **not** enabled in this private-draft phase.
