# EKODI Platform v3

Cloud-first pnpm monorepo for the EKODI ecosystem. GitHub is the source of truth, Codex Cloud and GitHub Codespaces can create a complete development environment, Cloudflare Workers hosts every application, Cloudflare D1 stores operational data, and Cloudflare R2 stores managed media.

## Applications

| Workspace | Production domain | Cloudflare Worker |
|---|---|---|
| `apps/platform` | `ekodi.kr` | `shy-thunder-39a4` |
| `apps/church` | `church.ekodi.kr` | `ekodi-church` |
| `apps/mission` | `mission.ekodi.kr` | `ekodi-mission` |
| `apps/biz` | `biz.ekodi.kr` | `ekodi-biz` |
| `apps/mall` | `mall.ekodi.kr` | `ekodi-mall` |
| `apps/trade` | `trade.ekodi.kr` | `ekodi-trade` |
| `apps/marketing` | `marketing.ekodi.kr` | `ekodi-marketing` |
| `apps/consulting` | `consulting.ekodi.kr` | `ekodi-consulting` |
| `apps/media` | `media.ekodi.kr` | `ekodi-media` |
| `apps/education` | `education.ekodi.kr` | `ekodi-education` |
| `apps/publishing` | `publishing.ekodi.kr` | `ekodi-publishing` |
| `apps/solution` | `solution.ekodi.kr` | `ekodi-solution` |
| `apps/erp` | `erp.ekodi.kr` | `ekodi-erp` |
| `apps/lab` | `lab.ekodi.kr` | `ekodi-lab` |
| `apps/community` | `community.ekodi.kr` | `ekodi-community` |
| `apps/operations-api` | Worker API | `ekodi-auth-api` |

Legacy service URLs remain in the ecosystem catalog and generated sites link back to them while content is migrated.

## Shared packages

- `packages/ui`: EKODI design tokens.
- `packages/auth`: shared authentication, role, and permission policy.
- `packages/database`: D1 binding and migration contracts.
- `packages/shared`: cross-runtime normalization and validation helpers.
- `packages/ui`: accessible EKODI design tokens and theme primitives.
- `packages/ekcms`: CMS, publication, and R2 media domain rules.
- `packages/erp`: ERP ledger contracts and validation.
- `packages/ecosystem-catalog`: application, domain, and legacy-source registry.
- `packages/cms-contracts`: CMS page validation and public response contracts.
- `packages/site-runtime`: secure static runtime used by managed sites.

## Development

Node.js 24 is used in CI and recommended locally. Node.js 22 or newer is supported.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm dev
```

The platform is served at `http://127.0.0.1:4173`. Each managed site can be built independently, for example:

```bash
corepack pnpm --filter @ekodi/marketing build
```

Configure Codex Cloud with Node.js 24 and `corepack pnpm install --frozen-lockfile` as the setup command. Repository-specific behavior and required checks are in `AGENTS.md`. GitHub Codespaces uses `.devcontainer/devcontainer.json` and the same installation command.

## CMS and operations

The authenticated platform console manages draft and published pages for every application. Published sites fetch read-only content from `apps/operations-api`; page content is rendered as text, not injected HTML. D1 revision history and audit records capture changes. DNS operations remain restricted to the five verified legacy zones and require the server-side `CF_API_TOKEN` secret.

Apply production migrations before deploying API changes:

```bash
corepack pnpm --filter @ekodi/operations-api migrate:production
```

## Automatic Cloudflare deployment

`infra/cloudflare/projects.json` is the canonical Workers Builds matrix. Connect each listed Worker to `topmaster-joseph/ekodi-platform`, use `main` as the production branch, keep the repository root as the build root, and copy the listed build/watch settings. Production pushes use `wrangler deploy`; non-production branches use `wrangler versions upload` for previews.

The GitHub-to-Cloudflare installation and custom-domain attachment are account-owner operations. Do not put Cloudflare credentials in GitHub source or repository variables. Runtime secrets belong in Cloudflare Workers secrets.

See `docs/ARCHITECTURE.md` for system boundaries and `docs/CLOUDFLARE_DEPLOYMENT.md` for the exact connection checklist.
