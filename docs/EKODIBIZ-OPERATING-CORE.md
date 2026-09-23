# EKODIBIZ Operating Core

## Decision

`에코디비즈 / EKODIBIZ` is the single official operating umbrella. Business lines are added as divisions rather than as separate identity, data, or admin silos.

Initial division registry:

- EKODI BOOKS
- EKODI LAB
- EKODI TRADE
- EKODI MARKETING
- EKODI AI (planned)

The registry is declarative in `config/ekodibiz-operating-core.json`. A new division should normally be introduced by adding a division record and only then exposing a public site when needed.

## Architecture choice

Do not rewrite the current platform merely to replace PHP or to force Next.js. The repository already has a production-oriented Cloudflare Worker/Node ESM architecture, staging configurations, Supabase migrations, service boundaries, and AI-provider resilience controls. Stability wins over fashion.

Use the existing platform shape:

1. Cloudflare surfaces and Workers for web/API delivery.
2. Supabase/PostgreSQL for durable structured records and row-level access control.
3. Existing central Person + Space/tenant + Role/Capability identity model.
4. External document providers such as Google Drive for original files, referenced from structured records rather than duplicated into chat history.
5. GitHub as the source of truth for code, migration history, configuration, and release review.
6. AI as an optional operational layer. Core business records must remain available when every external AI provider is disabled.

## Data model

The additive migration `20260819132000_ekodibiz_operating_core.sql` introduces four private tables:

- `ekodibiz_divisions`: business-unit registry under the existing tenant boundary.
- `ekodibiz_projects`: projects owned by a division.
- `ekodibiz_records`: confirmed operational memory such as decisions, activities, finance events, contracts, publication/trade/marketing/research events.
- `ekodibiz_document_links`: references to durable originals held by external document storage.

This intentionally does not create a second user/account system. Access is derived from the existing `tenant_members` and platform-admin boundaries.

## Record principle

Chat is not the ledger. AI conversation may propose or extract information, but durable operational memory is written only as structured records. High-risk external actions remain approval-gated.

The expected hierarchy is:

`EKODIBIZ -> Division -> Project -> Record -> Document link`

A person or organization can participate across multiple divisions without duplicate identity records.

## Reliability rules

- Production remains unchanged until staging validation passes.
- Schema changes are additive and reversible by data export/migration rather than provider lock-in.
- PostgreSQL data must be exportable in standard formats.
- Public sites may fail independently without corrupting the operating ledger.
- An AI outage must degrade assistance, not the core application.
- Payment, contractual commitment, external sending, tax filing, public release, and destructive deletion require explicit approval.
- Secrets remain server-side.

## Free-tier strategy

Free tiers are an optimization, not a dependency. The operating core must be portable if a provider changes limits or pricing. Cloudflare and Supabase can be used first where their free tiers fit actual load; when business criticality exceeds free-tier recovery guarantees, upgrade the smallest critical component rather than redesigning the platform.

## Rollout

1. Merge repository foundation after automated checks pass.
2. Provision or designate an isolated EKODIBIZ Supabase project. Do not place the business ledger inside church or external-client databases merely to avoid creating a project.
3. Apply migrations to a non-production/staging database first.
4. Run Supabase security and performance advisors; correct all material findings.
5. Seed the EKODIBIZ tenant and active divisions through an authenticated admin path, never by hardcoded generated UUIDs in migrations.
6. Add the `Divisions -> Projects -> Records -> Documents` admin view to `admin.ekodi.kr` using the shared shell.
7. Verify `AI_PROVIDER=NONE` and provider-failure scenarios before production release.
8. Promote using the repository's existing guarded staging/production workflow.

## Naming

Use `EKODIBIZ` as the official umbrella. Use division brands externally when appropriate, with the operating entity shown where legal/accounting context requires it. `EKODI LAB` is treated as a research division/brand until any formal corporate research-institute recognition is separately obtained.
