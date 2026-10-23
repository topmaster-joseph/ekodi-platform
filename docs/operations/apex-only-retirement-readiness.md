# EKODI apex-only web retirement readiness (C3)

Policy: `https://ekodi.kr/<path>` is the only canonical first-party production web entry. A source-code PR, successful unit test, or redirecting legacy host is **not** proof of domain retirement.

## Completed in the source migration candidate

- Update public service registry, ecosystem catalog, service manifest and relevant navigation to use apex routes.
- Canonical administrator and Books/Publishing public handoffs.
- Education `/edu` and My admission/study routes.
- Publishing catalog uses private Books Service Binding, not apex-to-apex Worker fetch.
- Constitution v1.27.2, source policy guard, regression tests and C3 owner approval label.

## Required before declaring any individual hostname retired

1. Read the active Cloudflare zone in both owned accounts and inventory hostname, Worker Custom Domain, Pages custom domain, DNS A/AAAA/CNAME, TLS, Access and wildcard rules.
2. Confirm the apex path serves the **actual destination service** with correct response semantics and assets, not a generic landing page.
3. Verify sessions, Google OAuth redirect/returnTo paths, workspace-level authorization, cookies, CSP, CSRF, and explicit `Origin` checks. **An apex origin by itself must not authorize all tenant paths.**
4. Update external registered callback URLs and provide evidence for successful webhook POST, auth and payment operations. Do not use HTTP redirects to rescue payment webhooks.
5. Verify email endpoints separately: browser entry may move to `/mail`, but keep live mail DNS (MX, SPF, DKIM, DMARC) and sender identity.
6. Obtain guarded release receipt, required CI/staging and operational canary evidence; store rollback artifacts and known-good configuration.
7. Remove Worker/Pages custom-domain bindings for this hostname; then remove only verified HTTP DNS records. Check propagation and monitor traffic for any remaining dependencies. Do not leave an indefinitely redirecting alias.
8. Independently recheck `ekodi.kr` login, payments, user/admin CRUD, multitenancy and service-health. On anomaly, follow the documented protected rollback.

## Known remaining hardcoded legacy origin risk

The following must be audited by the next migration wave **before** retiring their corresponding hosts:

- `auth-site/auth.js`, `auth-site/client-auth.js`, `auth-site/auth-workspace-target.js`: login origins and return URLs
- `supabase/functions/access-api/index.ts`: auth and workspace redirect allowlists
- External Google OAuth / payment provider callbacks, whose provider-side configuration is not contained in this repository
- `wrangler.*.toml`, Pages project custom-domain associations and deployed cloud account resources
- Domain-specific deep links in notification templates, live streams, stores and business workspaces

## Current evidence scope

This document records the source migration candidate and intentionally makes **no** claim that Cloudflare DNS, OAuth allowlists, payment providers, or live site routes were changed in production. An operator must attach timestamped first-party evidence and cutover receipts for each hostname before the zero-active-web-subdomains completion claim.

Do not perform bulk deletion based only on a list of historical hostnames; some DNS records may carry active email or domain validation responsibilities.
