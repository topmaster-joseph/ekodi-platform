# EKODI Cloud-First Roadmap

## Objective

Move the entire EKODI ecosystem to a web/cloud-first operating model:

- GitHub is the single source of truth for code.
- Codex Cloud is the primary development surface.
- Cloudflare provides automated preview and production deployment.
- `ekodi.kr` is the authenticated internal platform.
- Public services are exposed as independent `EKODI child-host address` subdomains.
- Content-level edits should be possible from a web admin CMS without local tooling.

## Target domain map

| Service | Domain | Access |
| --- | --- | --- |
| Platform | `ekodi.kr` | Login required |
| Church | `ekodi.kr/ekodichurch` | Public, EKCMS protected |
| Mission | `ekodi.kr/mission` | Public |
| Business hub | `ekodi.kr/ekodibiz` | Public |
| Mall | `ekodi.kr/ekodimall` | Public |
| Trade | `ekodi.kr/ekodibiz/trade` | Public, ERP protected |
| Marketing AI | `ekodi.kr/marketing` | Public, admin protected |
| Consulting | `ekodi.kr/consulting` | Public |
| Media | `ekodi.kr/media` | Public |
| Education | `ekodi.kr/education` | Public |
| Publishing | `ekodi.kr/publishing` | Public |
| Solutions | `ekodi.kr/solution` | Public |
| ERP | `ekodi.kr/erp` | Login required |
| Lab | `ekodi.kr/ekodilab` | Public |
| Community | `ekodi.kr/community` | Public |

## Migration principles

1. Preserve working production behavior before refactoring.
2. Add cloud automation before moving business logic.
3. Introduce subdomain apps incrementally instead of a flag-day rewrite.
4. Keep all secrets outside Git and inject them through Cloudflare/GitHub secrets.
5. Require CI checks before production promotion.
6. Prefer preview deployments for every pull request.
7. Keep private data and administrative functions behind server-side authorization.

## Phases

### Phase 1 - Delivery foundation

- Keep current static control center and Worker API operational.
- Add a deployment workflow that runs validation first.
- Document the target subdomain map and deployment contract.
- Prepare a repository layout that can grow into a monorepo without breaking current production.

### Phase 2 - Application split

Introduce `apps/` for independently deployable surfaces and `packages/` for shared code.

```text
apps/
  platform/
  church/
  mission/
  biz/
  mall/
  trade/
  marketing/
  consulting/
  media/
  education/
  publishing/
  solution/
  erp/
  lab/
  community/
packages/
  ui/
  auth/
  database/
  content/
  shared/
  ekcms/
  erp/
```

### Phase 3 - Web administration

- Content manager for public sites.
- Role-based access control.
- EKCMS for church administration.
- ERP for EKODI Biz operations.
- Audit log for all administrative changes.

### Phase 4 - AI operations

- AI document assistant.
- AI marketing workflows.
- AI development request intake.
- Deployment summaries and rollback guidance.

## Deployment contract

Production changes should follow:

```text
Codex Cloud / browser
  -> feature branch
  -> pull request
  -> CI validation
  -> preview deployment
  -> merge to main
  -> Cloudflare production deployment
```

Local development remains optional rather than required.
