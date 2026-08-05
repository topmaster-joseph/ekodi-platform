# EKODI application and deployment inventory

Status as of 2026-08-05. “Configured” means the code and Wrangler project exist in this repository; it does not mean the Worker or custom domain is live.

## Verified existing deployments

| Component | Verified URL | Cloudflare resource | State |
|---|---|---|---|
| Platform control center | `https://shy-thunder-39a4.topmaster-joseph.workers.dev` | Worker `shy-thunder-39a4` | Existing v3 deployment; monorepo update pending |
| Operations API | `https://ekodi-auth-api.topmaster-joseph.workers.dev` | Worker `ekodi-auth-api` | Existing v3 deployment; Hono/CMS/RBAC update pending |
| Operations database | n/a | D1 `ekodi-auth` | Existing production database; migrations 0003–0004 pending |
| DNS integration secret | n/a | Worker secret `CF_API_TOKEN` | Existing; value is not stored in GitHub |

## Application matrix

| App | Target domain | Worker | Legacy/source link | Access | Repository state |
|---|---|---|---|---|---|
| `platform` | `ekodi.kr` | `shy-thunder-39a4` | Existing control center | Login required, noindex | Configured |
| `church` | `church.ekodi.kr` | `ekodi-church` | `https://ekodichurch.kr` | Public | Configured |
| `mission` | `mission.ekodi.kr` | `ekodi-mission` | `https://youtube.com/@ekodicommunity` | Public | Configured |
| `biz` | `biz.ekodi.kr` | `ekodi-biz` | `https://ekodibiz.kr` | Public | Configured |
| `mall` | `mall.ekodi.kr` | `ekodi-mall` | `https://ekodimall.kr` | Public | Configured |
| `trade` | `trade.ekodi.kr` | `ekodi-trade` | No verified legacy site | Public | Configured |
| `marketing` | `marketing.ekodi.kr` | `ekodi-marketing` | No verified legacy site | Public | Configured |
| `consulting` | `consulting.ekodi.kr` | `ekodi-consulting` | No verified legacy site | Public | Configured |
| `media` | `media.ekodi.kr` | `ekodi-media` | No verified legacy site | Public | Configured |
| `education` | `education.ekodi.kr` | `ekodi-education` | No verified legacy site | Public | Configured |
| `publishing` | `publishing.ekodi.kr` | `ekodi-publishing` | `https://ekodibook.kr` | Public | Configured |
| `solution` | `solution.ekodi.kr` | `ekodi-solution` | No verified legacy site | Public | Configured |
| `erp` | `erp.ekodi.kr` | `ekodi-erp` | No verified legacy site | Login required | Configured |
| `lab` | `lab.ekodi.kr` | `ekodi-lab` | `https://ekodilab.kr` | Public | Configured |
| `community` | `community.ekodi.kr` | `ekodi-community` | `https://youtube.com/@ekodicommunity` | Public | Configured |

All public applications use the shared React/TypeScript/Vite/Tailwind runtime and anonymously readable published EKCMS content. Drafts, revisions, media administration, and internal records are authenticated. Worker creation, Workers Builds Git connections, R2 bucket creation, and custom-domain attachment remain deployment steps.

## Git branches

- `main`: current production source before this refactor.
- `backup/pre-v3-monorepo-20260805`: immutable backup at commit `278fb8476f4c66a0fd543466245c551e5a420334`.
- `agent/ekodi-platform-v3-monorepo`: active monorepo implementation branch.
