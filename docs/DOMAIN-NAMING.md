# EKODI Domain Naming Standard

`ekodi.kr` is the canonical digital root of the EKODI ecosystem.

## 1. First-level service domains

Use a first-level subdomain when the service is an ecosystem-wide brand, platform, or shared capability.

| Purpose | Canonical address |
|---|---|
| Business | `biz.ekodi.kr` |
| Trading | `trade.ekodi.kr` |
| Mall | `mall.ekodi.kr` |
| Payments | `pay.ekodi.kr` |
| Books | `books.ekodi.kr` |
| Lab | `lab.ekodi.kr` |
| Church | `church.ekodi.kr` |
| Mission | `mission.ekodi.kr` |
| Community | `community.ekodi.kr` |
| Insurance | `ins.ekodi.kr` |
| Education | `edu.ekodi.kr` |
| Media | `media.ekodi.kr` |
| Events | `event.ekodi.kr` |
| Giving | `give.ekodi.kr` |
| Administration | `admin.ekodi.kr` |
| Shared API | `api.ekodi.kr` |

## 2. Nested functional domains

When the same function can exist independently inside multiple EKODI units, use:

`<function>.<unit>.ekodi.kr`

Examples:

- Church live broadcast: `live.church.ekodi.kr`
- Business live broadcast: `live.biz.ekodi.kr`
- Church webmail entry: `mail.church.ekodi.kr`
- Business webmail entry: `mail.biz.ekodi.kr`
- Church administration: `admin.church.ekodi.kr`
- Business administration: `admin.biz.ekodi.kr`
- Business API: `api.biz.ekodi.kr`
- Trading API: `api.trade.ekodi.kr`

This allows identical functions such as `live`, `mail`, `admin`, and `api` to be operated independently while remaining under one `ekodi.kr` zone.

## 3. Shared vs unit-specific rule

Use a first-level domain when one service is shared across the whole ecosystem.

- Shared payments: `pay.ekodi.kr`
- Shared identity/admin: `admin.ekodi.kr`
- Shared API gateway: `api.ekodi.kr`

Use a nested domain when a unit needs its own independent instance.

- `mail.biz.ekodi.kr` and `mail.church.ekodi.kr`
- `live.biz.ekodi.kr` and `live.church.ekodi.kr`

## 4. Infrastructure rule

- DNS authority stays under the single Cloudflare zone `ekodi.kr`.
- Each subdomain may point to a different Cloudflare Worker, Pages project, SaaS provider, mail service, or external platform.
- A subdomain does not need to share hosting, deployment, authentication, accounting, or operations with its sibling domains.
- Prefer Cloudflare Worker Custom Domains when automatic DNS and TLS provisioning is useful.
- Keep secrets, API tokens, and credentials server-side and outside Git.

## 5. Legacy standalone domains

Existing standalone EKODI domains are retained for brand protection and transition.

After the corresponding `*.ekodi.kr` service is verified in production, the standalone domain should normally become a permanent redirect to the canonical EKODI address.

Examples:

- `ekodichurch.kr` → `church.ekodi.kr`
- `ekodilab.kr` → `lab.ekodi.kr`
- `ekodimall.kr` → `mall.ekodi.kr`
- `ekodibook.kr` → `books.ekodi.kr`
- `ekodibiz.kr` → `biz.ekodi.kr` after `biz.ekodi.kr` is production-ready

## 6. Current activation status

Production:

- `books.ekodi.kr`
- `church.ekodi.kr`
- `lab.ekodi.kr`
- `mall.ekodi.kr`

Broadcast gateway:

- `live.church.ekodi.kr` → EKODI Church YouTube live page

Reserved for future service deployment:

- `biz.ekodi.kr`
- `trade.ekodi.kr`
- `pay.ekodi.kr`
- `ins.ekodi.kr`
- `mission.ekodi.kr`
- `community.ekodi.kr`
- `mail.biz.ekodi.kr`
- `mail.church.ekodi.kr`
- `live.biz.ekodi.kr`
