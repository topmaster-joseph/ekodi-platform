# EKODI Canonical Web Address Standard

Effective policy (owner-approved C3 migration, 2026-10-23): **all first-party web entry points use `https://ekodi.kr/<path>`**. No `*.ekodi.kr` web host is a canonical user, administrator, API or service entry. A redirecting legacy hostname is **not** a completed migration.

## Canonical URL examples

| Surface | Canonical address |
| --- | --- |
| EKODI root | `https://ekodi.kr/` |
| Central administrator | `https://ekodi.kr/admin/` |
| Personal home | `https://ekodi.kr/my/` |
| Sign-in / callbacks | `https://ekodi.kr/auth/` |
| Control API | `https://ekodi.kr/api/` |
| EKODI Business | `https://ekodi.kr/ekodibiz/` |
| EKODI Mall | `https://ekodi.kr/ekodimall/` |
| EKODI Church | `https://ekodi.kr/ekodichurch/` |
| EKODI Mission | `https://ekodi.kr/ekodimission/` |
| EKODI Lab | `https://ekodi.kr/ekodilab/` |
| Books / publishing | `https://ekodi.kr/books/` and `https://ekodi.kr/publishing/` |
| Education | `https://ekodi.kr/edu/` |
| Workspace administration | `https://ekodi.kr/{workspace}/admin/` |
| Workspace service administration | `https://ekodi.kr/{workspace}/{service}/admin/` |
| Live / mail browser | `https://ekodi.kr/live/` and `https://ekodi.kr/mail/` |

The actual canonical path is owned by `platform-route-registry.js`, `config/domain-canonical-policy.json` and service-specific routing contracts. Resolve any conflicting legacy route before cutover, never silently combine distinct business, church, tenant, or accounting boundaries.

## Runtime independence

A single browser origin **does not merge security realms, database tenancy, deployment ownership or accounting entities**. Route by path at the EKODI apex gateway, then reach independent Workers via Service Bindings, internal platform APIs or private adapters. Enforce authentication, RBAC/ABAC, CSRF, Origin validation, rate limits and cache isolation at the **actual destination**. Private and administrator requests must not be cached publicly. Never trust path prefixes or browser supplied workspace IDs alone as authorization.

Production HTTP routing is apex-only after per-service verification. Development `workers.dev` endpoints may remain Cloudflare Access protected, noncanonical and unindexed for staging/last-known-good recovery. Never publicize them as service URL.

## Migration and retirement (not redirects)

1. Inventory every GitHub repo/branch, CI workflow, Cloudflare zone/DNS/Worker Custom Domain/Pages/Access rule, OAuth redirect URI, webhook, browser link, mail/SMS template, sitemap, QR and externally registered endpoint.
2. Register one canonical apex URL per service and resolve collisions. Update source and configuration, API callbacks, cookies, CSP/CORS and origin checks.
3. Test real GET/POST/webhooks, Google login/return_to, user/tenant/admin authorization, payment/order/refund and browser static assets through the canonical paths.
4. Promote with the repository's safeguarded CI/PR/orchestrator staging and production process; record deployment SHA and health/test evidence.
5. Only after canonical readiness and upstream callbacks are changed, remove legacy Worker Custom Domain/Pages binding, then A/AAAA/CNAME and wildcard records. Do **not** leave 301/302/307/308 redirects or a web-only alias.
6. Confirm the retired hostname is no longer serving, apex remains healthy, and no client/service logs continue using old URLs. Preserve a documented recoverable release; do not blindly reattach insecure old aliases.
7. Prevent new `*.ekodi.kr` browser endpoints through protected configuration review, CI checks and domain inventory drift alerts.

## Email and external ownership exceptions

A browser gateway like `mail.biz.ekodi.kr` is retired in favor of `ekodi.kr/mail`. Real email identities (`user@biz.ekodi.kr`), however, are **email address domains**, not browser hostnames. Never delete their MX/SPF/DKIM/DMARC or domain verification DNS records without a separate mail migration and verified continuity. Customer-owned domains (for example `cgma.or.kr`) are independent branded contracts; do not delete, hijack or silently rewrite their DNS because EKODI changes its own zone.

This policy supersedes the old "first-level service subdomain", nested function subdomain, customer AI subdomain and webmail redirect architecture described in prior revisions. Cloudflare production DNS retirement is a separate, evidence-gated operation — a source-only change is not proof of retirement.
