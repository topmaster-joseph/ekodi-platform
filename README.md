# EKODI Platform v3

Production-oriented MVP for operating the EKODI ecosystem. The platform combines a public service gateway with an authenticated control center for service health, domain registration metadata, Cloudflare DNS, operational exports, and audit history.

## MVP capabilities

- Public EKODI portal built on the EKODI Church live-site design system
- Public gateway for six EKODI services
- Scheduled health checks with online, degraded, and offline states
- Single-admin authentication backed by Cloudflare D1
- Allow-listed management of five EKODI Cloudflare zones
- DNS create and delete workflows with server-side validation
- Domain registration and renewal ledger
- Immutable operational audit events for security-sensitive changes
- JSON operational report export
- Strict browser security headers and production CORS allow-list
- Node test suite and GitHub Actions CI

The UI intentionally excludes simulated approvals, fabricated recommendations, and placeholder business metrics. Features shown in the control center are backed by real data or clearly marked as configuration work.

## Public portal

The landing page inherits the design system of the deployed EKODI Church site
(<https://ekodi-church-live.topmaster-joseph.workers.dev/>): forest, cream and gold palette,
Noto Serif KR headings, and the same section rhythm. It presents the ecosystem in four parts.

| Section | Content |
|---|---|
| `#about` | The four movements — 에클레시아, 코이노니아, 디아스포라, 희년 |
| `#services` | The six services with their measured status |
| `#status` | Online, degraded and pending counts plus the last probe timestamp |
| `#connect` | Church live site and contact details |

Service states come from `monitor-status.json`. The page reads the published snapshot on `main`
and falls back to the copy bundled with the deployed site when that request fails, so the portal
never shows an empty status. Administrator sign-in opens a modal dialog and, on success, replaces
the portal with the control center in the same tab.

## Architecture

```text
Browser (static control center)
  ├─ monitor-status.json ← scheduled GitHub Actions probe
  └─ HTTPS JSON API      → Cloudflare Worker
                              ├─ D1: admins, sessions, registry, audit
                              └─ Cloudflare API: allow-listed DNS zones
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

1. Review `wrangler.api.toml` and `wrangler.site.toml` for the target Cloudflare account.
2. Apply migrations: `npx wrangler d1 migrations apply ekodi-auth --remote --config wrangler.api.toml`.
3. Store a restricted API token: `npx wrangler secret put CF_API_TOKEN --config wrangler.api.toml`.
4. Deploy the API: `npm run deploy:api`.
5. Deploy the static dashboard: `npm run deploy:site`.
6. Confirm `GET /health`, then verify login, registry, DNS, logout, and audit history.

The Cloudflare token should only grant Zone Read and DNS Edit for the five managed EKODI zones. Never commit `.dev.vars`.

## Connected services

- 에코디몰: https://ekodimall.kr
- 에코디비즈: https://ekodibiz.kr
- 에코디출판: https://ekodibook.kr
- 에코디교회: https://ekodichurch.kr
- 에코디연구소: https://ekodilab.kr
- 에코디선교회: https://youtube.com/@ekodicommunity
