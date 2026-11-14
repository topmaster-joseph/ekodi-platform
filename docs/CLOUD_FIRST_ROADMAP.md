# EKODI Cloud-First Roadmap

## 현재 정책 우선순위

> **2026-10-23 승인된 C3 헌법이 이 문서의 옛 서브도메인 확장 계획을 대체합니다.** 운영 웹 진입은 `https://ekodi.kr/{path}`만 사용하며, `*.ekodi.kr` 신규·보조·리디렉션 도메인을 생성하지 않습니다. 실제 DNS/Worker 제거는 `docs/DOMAIN-NAMING.md`의 보호 절차를 통과한 호스트에만 적용합니다. 이 문서의 과거 구현 단계는 역사적 참고자료일 뿐, 현재 도메인 생성 승인이 아닙니다.

## Objective

Move the entire EKODI ecosystem to a web/cloud-first operating model:

- GitHub is the single source of truth for code.
- Codex Cloud is the primary development surface.
- Cloudflare provides automated preview and production deployment.
- `ekodi.kr` is the authenticated internal platform.
- Public services are exposed as independent **paths on `https://ekodi.kr`**, while backend services and tenant security remain isolated.
- Content-level edits should be possible from a web admin CMS without local tooling.

## Canonical web path map (current)

| Service | Web entry | Access |
| --- | --- | --- |
| Platform | `https://ekodi.kr/` | Public/platform-specific login |
| Church | `https://ekodi.kr/ekodichurch/` | Public + protected membership/admin |
| Mission | `https://ekodi.kr/ekodimission/` | Public + protected roles |
| Business hub | `https://ekodi.kr/ekodibiz/` | Public + protected roles |
| Mall | `https://ekodi.kr/ekodimall/` | Public + protected merchant roles |
| Trade | `https://ekodi.kr/trade/` | Public + ERP protection |
| Marketing | `https://ekodi.kr/marketing/` | Public + protected admin |
| Media | `https://ekodi.kr/media/` | Service-specific |
| Education | `https://ekodi.kr/edu/` | Public + protected roles |
| Publishing | `https://ekodi.kr/publishing/` | Public + protected roles |
| Lab | `https://ekodi.kr/ekodilab/` | Public + protected roles |
| Community | `https://ekodi.kr/community/` | Public + protected roles |
| Login/Admin | `https://ekodi.kr/auth/`, `/admin/` | Authenticated by role |

Every path must be confirmed in `platform-route-registry.js` and the real upstream before it is advertised as live. Subdomain retirement depends on provider callbacks, cross-site authorization, preserved mail DNS and guarded Cloudflare C3 release.

## Migration principles

1. Preserve working production behavior before refactoring.
2. Add cloud automation before moving business logic.
3. Introduce independently deployable service modules behind verified apex-path routes, not new browser subdomains.
4. Keep all secrets outside Git and inject them through Cloudflare/GitHub secrets.
5. Require CI checks before production promotion.
6. Prefer preview deployments for every pull request.
7. Keep private data and administrative functions behind server-side authorization.

## Phases

### Phase 1 - Delivery foundation

- Keep current static control center and Worker API operational.
- Add a deployment workflow that runs validation first.
- Document the canonical apex-path map, protected service bindings, and deployment contract.
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
