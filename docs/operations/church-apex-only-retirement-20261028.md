# EKODI Church: approved apex-only domain retirement — 2026-10-28

**Current intended canonical browser entry:** https://ekodi.kr/ekodichurch/

The legacy browser hostname `church.ekodi.kr` is **not** an approved fallback, mirror, or redirect. Production retirement must be proven in Cloudflare, not inferred from a PR, metadata link, canonical tag, or a simple HTTP redirect.

## EKODI Orchestrator ownership

- Owner command 2026-10-28; tracking issue #6533.
- Existing C3 domain-retirement approval: `governance/amendments/2026-09-13-church-lab-subdomain-retirement-v1.12.0.json`.
- Authored implementation PR #6534 was formally superseded by the orchestrator's protected recovery PR #6535. Do not merge the retired implementation PR.
- Only the EKODI Orchestrator's authentic release receipt, the required exact-SHA checks and the protected production environment may authorize changes.

## Scope

1. Keep canonical public Church, worship material, member home, pastor admin, and shared Live routing under existing apex paths. A church website moving to `/ekodichurch/` does not move Live's canonical `/live/church/` route.
2. Migrate remaining public and admin registry references to `https://ekodi.kr/ekodichurch/`; historical legacy alias lookup may exist solely to interpret stored rows.
3. After canonical and authenticated callbacks are verified, inspect the Cloudflare production account and `ekodi.kr` zone. Detach the **exact** retired Church hostname from Pages custom domains, Worker custom domains and routes, and only the hostname's A/AAAA/CNAME web DNS.
4. Do **not** delete the `ekodi-church` Pages project, Shared Site Worker, Church content, roles, data, mail identities, MX/TXT records, unrelated domains, or other tenants.
5. Preserve a readable Cloudflare evidence receipt: canonical status, binding inventory and owners, scoped deletes, post-detach inventory, external old-host non-service, production member/admin regression, and quota outcome.

## Release blockers

- Unrecognized custom-domain ownership or ambiguous DNS: fail closed.
- Canonical root/member health failure or Cloudflare quota protect/exhausted: **no deletion**.
- Missing authentic owner/Orchestrator approval, protected required checks, or production environment permission: **no release**.
- Google/provider callback, auth-return, CSRF, CORS, workspace access or live-broadcast release risk not independently verified: **hold production retirement**. Browser tests without a real signed-in operator cannot prove their authenticated functionality.

## Completion criteria

Only announce *legacy domain disabled* after Cloudflare confirms zero exact-host Pages/Worker/HTTP-DNS bindings **and** an independent external HTTP request confirms the old hostname no longer serves or redirects a site, while canonical Church and dependent operations remain functional. A CI green result alone is not completion.
