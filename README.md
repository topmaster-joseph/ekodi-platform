# EKODI Platform v3

Production-oriented MVP for operating the EKODI ecosystem. The platform combines a public service gateway with an authenticated control center for service health, domain registration metadata, Cloudflare DNS, operational exports, and audit history.

## Domain policy

`ekodi.kr` is the primary digital root for the EKODI ecosystem. New services should use hierarchical service subdomains by default instead of purchasing additional standalone domains.

Primary service addresses:

- Root portal: https://ekodi.kr
- Business: https://biz.ekodi.kr
- Trading: https://trade.biz.ekodi.kr
- Mall: https://mall.ekodi.kr
- Payments: https://pay.ekodi.kr
- Books: https://books.ekodi.kr
- Lab: https://lab.ekodi.kr
- Church: https://church.ekodi.kr
- Mission: https://mission.ekodi.kr
- Community: https://community.ekodi.kr
- Insurance: https://ins.ekodi.kr
- Education: https://edu.ekodi.kr
- Media: https://media.ekodi.kr
- Events: https://event.ekodi.kr
- Giving: https://give.ekodi.kr
- Admin: https://admin.ekodi.kr
- API: https://api.ekodi.kr

The preferred hierarchy for organization-specific functions is `[service].[organization].ekodi.kr`, for example `mail.biz.ekodi.kr`, `live.church.ekodi.kr`, and `trade.biz.ekodi.kr`. Global services may remain directly under `ekodi.kr` when they serve the whole ecosystem.

`trade.ekodi.kr` is retained only as a transition alias and permanently redirects to the canonical `trade.biz.ekodi.kr` address.

Existing standalone EKODI domains remain as brand-protection and transition domains. Where appropriate they should redirect permanently to the canonical EKODI service address.

## MVP capabilities

- Public gateway for EKODI services
- Scheduled health checks with online, degraded, and offline states
- Single-admin authentication backed by Cloudflare D1
- Cloudflare DNS management with server-side validation
- Domain registration and renewal ledger
- Immutable operational audit events for security-sensitive changes
- JSON operational report export
- Strict browser security headers and production CORS allow-list
- Node test suite and GitHub Actions CI

The UI intentionally excludes simulated approvals, fabricated recommendations, and placeholder business metrics. Features shown in the control center are backed by real data or clearly marked as configuration work.

## Architecture

```text
Browser (static control center)
  ├─ monitor-status.json ← scheduled GitHub Actions probe
  └─ HTTPS JSON API      → Cloudflare Worker
                              ├─ D1: admins, sessions, registry, audit
                              └─ Cloudflare API: DNS and domain operations

                         ekodi.kr
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   Ministry/Community    Business/Commerce     Knowledge
        │                   │                   │
 church.ekodi.kr        biz.ekodi.kr        books.ekodi.kr
 mission.ekodi.kr       trade.biz.ekodi.kr  lab.ekodi.kr
 community.ekodi.kr     mall.ekodi.kr       edu.ekodi.kr
                        pay.ekodi.kr
                        ins.ekodi.kr
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, security decisions, and the production checklist.

## Local verification

Requires Node.js 20 or newer; CI and monitoring use Node.js 24.

```bash
npm run check
npm test
npm run dev
```

The local control center is served at `http://127.0.0.1:4173`. Authentication and DNS functions require a deployed Worker or a local Wrangler environment.

## Cloudflare deployment

1. Review `wrangler.api.toml`, `wrangler.site.toml`, and service-specific Wrangler configs for the target Cloudflare account.
2. Apply migrations: `npx wrangler d1 migrations apply ekodi-auth --remote --config wrangler.api.toml`.
3. Store a restricted API token: `npx wrangler secret put CF_API_TOKEN --config wrangler.api.toml`.
4. Deploy the API: `npm run deploy:api`.
5. Deploy the static dashboard: `npm run deploy:site`.
6. Deploy service Workers/Pages and attach their canonical `*.ekodi.kr` custom domains.
7. Confirm health, login, registry, DNS, logout, and audit history.

The Cloudflare token should follow least-privilege permissions for the `ekodi.kr` zone and any legacy zones that remain under management. Never commit `.dev.vars` or API secrets.

## Connected services

Canonical EKODI addresses:

- 에코디 통합: https://ekodi.kr
- 에코디비즈: https://biz.ekodi.kr
- EKODI Global Trading: https://trade.biz.ekodi.kr
- 에코디몰: https://mall.ekodi.kr
- 에코디결제: https://pay.ekodi.kr
- 에코디북스: https://books.ekodi.kr
- 에코디교회: https://church.ekodi.kr
- 에코디연구소: https://lab.ekodi.kr
- 에코디선교회: https://mission.ekodi.kr
- 에코디커뮤니티: https://community.ekodi.kr
- 에코디보험: https://ins.ekodi.kr
