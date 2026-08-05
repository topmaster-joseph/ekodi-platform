# EKODI Platform v3 architecture

## System shape

```text
GitHub repository
  ├─ Codex Cloud / Codespaces development
  ├─ GitHub Actions validation and service monitoring
  └─ Cloudflare Workers Builds
       ├─ 15 independently deployed web applications
       └─ operations API
            ├─ D1: admins, sessions, CMS, revisions, registry, audit
            ├─ R2: private-by-default managed media
            └─ Cloudflare API: allow-listed DNS management
```

The monorepo keeps independent deployment boundaries under `apps/*`. Shared, side-effect-free contracts live under `packages/*`; build and monitoring programs live under `tools/*`. `infra/cloudflare/projects.json` is the deployment inventory.

## Content architecture

Each managed public site is a small static Worker built from a shared runtime. It requests only published pages for its own catalog `siteId`. The authenticated admin console creates drafts, uses optimistic version checks when saving, publishes explicit revisions, and records audit events. Public pages never expose drafts and render content using `textContent` to prevent stored script execution.

Existing service URLs are retained as legacy sources. The generated application shell links to the corresponding legacy site until content migration has been verified. Custom-domain cutover is therefore separate from application creation.

## Security boundaries

- Production CORS origins are explicit and split between the admin console and public content consumers.
- Administrator passwords use salted PBKDF2 hashes with versioned work factors; legacy hashes upgrade after successful login.
- Opaque session tokens are stored only as SHA-256 hashes in D1 and expire after eight hours.
- Login attempts are throttled per hashed client IP.
- CMS and operational mutations require an authenticated administrator and produce audit records.
- Role-based permissions separate content, media, operational, and read-only access.
- CMS data classification blocks internal, confidential, and restricted content from anonymous publication.
- D1 queries use bound parameters; CMS updates use an optimistic version check.
- DNS types, names, values, TTLs, zone IDs, and record IDs are validated server-side.
- Cloudflare API tokens remain Worker secrets with least-privilege zone scope.
- Domain registration, payments, OAuth installation, custom-domain attachment, and billing remain account-owner actions.

## Data ownership

| Data | System of record |
|---|---|
| Source and deployment configuration | GitHub |
| Published and draft content | Cloudflare D1 |
| Content revisions and audit history | Cloudflare D1 |
| Admin identities and sessions | Cloudflare D1 |
| DNS records and Worker routes | Cloudflare |
| Registration dates and renewal metadata | Cloudflare D1 registry |
| Legacy site content | Existing verified service URLs until migrated |
| Availability snapshot | GitHub Actions monitor artifact committed to the platform app |

## Acceptance gates

1. `corepack pnpm install --frozen-lockfile` succeeds from a fresh clone on Node.js 24.
2. `corepack pnpm verify` validates every workspace, test, generated site, and deployment mapping.
3. D1 migrations apply without drift.
4. API health, production CORS, login, CMS draft/save/publish, registry, DNS, logout, and audit paths pass against the deployed Worker.
5. Cloudflare Workers Builds is connected for every project, with `main` production and branch previews enabled.
6. Custom domains are attached only after zone ownership and cutover approval.
7. Public URLs are verified with cache-busting requests after deployment.

## Deferred beyond MVP

- OIDC or Cloudflare Access federation.
- Rich-text HTML rendering and automated media transformations.
- Commerce, ERP, or other app-specific business workflows.
- Automated import of unverified legacy content.
- Billing or registrar automation.
