# EKODI application and deployment inventory

Status as of 2026-08-06. A “Worker live” state means the cache-busted `workers.dev` URL returned HTTP 200 after the v3 bootstrap; it does not mean the requested custom domain has been attached.

## Verified existing deployments

| Component | Verified URL | Cloudflare resource | State |
|---|---|---|---|
| Platform control center | `https://shy-thunder-39a4.topmaster-joseph.workers.dev` | Worker `shy-thunder-39a4` | Existing deployment preserved; monorepo version `74f771bb-ba53-491b-a949-1e28ea857abb` uploaded but not promoted |
| Operations API | `https://ekodi-auth-api.topmaster-joseph.workers.dev` | Worker `ekodi-auth-api` | Existing deployment preserved; hardened Hono/CMS/RBAC version awaits R2 activation |
| Operations database | n/a | D1 `ekodi-auth` | Migrations 0003–0006 applied successfully; no pending migration |
| Media storage | n/a | R2 `ekodi-media` | Blocked: account API requires R2 activation (`10042`) |
| DNS integration secret | n/a | Worker secret `CF_API_TOKEN` | Existing; value is not stored in GitHub |

## Application matrix

| App | Target domain | Worker | Legacy/source link | Access | Repository state |
|---|---|---|---|---|---|
| `platform` | `ekodi.kr` | `shy-thunder-39a4` | Existing control center | Login required, noindex | Version uploaded; promotion pending R2/API |
| `church` | `church.ekodi.kr` | `ekodi-church` | `https://ekodichurch.kr` | Public | Worker live; domain pending |
| `mission` | `mission.ekodi.kr` | `ekodi-mission` | `https://youtube.com/@ekodicommunity` | Public | Worker live; domain pending |
| `biz` | `biz.ekodi.kr` | `ekodi-biz` | `https://ekodibiz.kr` | Public | Worker live; domain pending |
| `mall` | `mall.ekodi.kr` | `ekodi-mall` | `https://ekodimall.kr` | Public | Worker live; domain pending |
| `trade` | `trade.ekodi.kr` | `ekodi-trade` | No verified legacy site | Public | Worker live; domain pending |
| `marketing` | `marketing.ekodi.kr` | `ekodi-marketing` | No verified legacy site | Public | Worker live; domain pending |
| `consulting` | `consulting.ekodi.kr` | `ekodi-consulting` | No verified legacy site | Public | Worker live; domain pending |
| `media` | `media.ekodi.kr` | `ekodi-media` | No verified legacy site | Public | Worker live; domain pending |
| `education` | `education.ekodi.kr` | `ekodi-education` | No verified legacy site | Public | Worker live; domain pending |
| `publishing` | `publishing.ekodi.kr` | `ekodi-publishing` | `https://ekodibook.kr` | Public | Worker live; domain pending |
| `solution` | `solution.ekodi.kr` | `ekodi-solution` | No verified legacy site | Public | Worker live; domain pending |
| `erp` | `erp.ekodi.kr` | `ekodi-erp` | No verified legacy site | Login required, noindex | Worker live; API/domain pending |
| `lab` | `lab.ekodi.kr` | `ekodi-lab` | `https://ekodilab.kr` | Public | Worker live; domain pending |
| `community` | `community.ekodi.kr` | `ekodi-community` | `https://youtube.com/@ekodicommunity` | Public | Worker live; domain pending |

All public applications use the shared React/TypeScript/Vite/Tailwind runtime and anonymously readable published EKCMS content. Drafts, revisions, media administration, and internal records are authenticated. All 14 new application Workers were created and verified with cache-busting requests; Workers Builds Git connections, R2 activation/bucket creation, API promotion, and custom-domain attachment remain deployment steps.

## Git branches

- `main`: current production source before this refactor.
- `backup/pre-v3-monorepo-20260805`: immutable backup at commit `278fb8476f4c66a0fd543466245c551e5a420334`.
- `agent/ekodi-platform-v3-monorepo`: active monorepo implementation branch.
