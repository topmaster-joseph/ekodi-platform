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
| Shared webmail entry | `mail.ekodi.kr` |

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

## 3. Mail architecture

Webmail entry hostnames and email-address domains are intentionally separate.

### Webmail entry domains

The following hostnames are stable browser entry points and currently redirect to Google Gmail. They can later be retargeted without changing the public address.

- `mail.ekodi.kr` — shared EKODI mail entry
- `mail.biz.ekodi.kr` — EKODI Biz mail entry
- `mail.church.ekodi.kr` — EKODI Church mail entry
- `mail.lab.ekodi.kr` — EKODI Lab mail entry
- `mail.books.ekodi.kr` — EKODI Books mail entry
- `mail.trade.ekodi.kr` — EKODI Trading mail entry

### Email-address domains

Do not create user addresses such as `user@mail.biz.ekodi.kr` unless there is a specific technical reason. The preferred address pattern is:

- EKODI root identity: `user@ekodi.kr`
- Business: `user@biz.ekodi.kr`
- Church: `user@church.ekodi.kr`
- Lab: `user@lab.ekodi.kr`
- Books: `user@books.ekodi.kr`
- Trading: `user@trade.ekodi.kr`

Each address domain can be added to Google Workspace as a secondary domain or domain alias according to the organizational requirement. Incoming mail requires MX records on the email-address domain itself, not on the `mail.*` browser-entry hostname.

For Google Workspace, keep SPF, DKIM, and DMARC aligned with every domain that is enabled for sending mail.

### Recommended rollout

1. Keep the currently operating `@ekodibiz.kr` Workspace mail unchanged during migration.
2. Add `biz.ekodi.kr` to Google Workspace and verify domain ownership before enabling mail on it.
3. Add the required MX and authentication records for `biz.ekodi.kr`.
4. Test sending and receiving before making new addresses public.
5. Repeat for `church.ekodi.kr`, `lab.ekodi.kr`, `books.ekodi.kr`, and `trade.ekodi.kr` only when each unit actually needs its own mail identity.
6. Keep `mail.*` URLs as stable browser gateways independent of the underlying mail provider.

## 4. Shared vs unit-specific rule

Use a first-level domain when one service is shared across the whole ecosystem.

- Shared payments: `pay.ekodi.kr`
- Shared identity/admin: `admin.ekodi.kr`
- Shared API gateway: `api.ekodi.kr`
- Shared webmail entry: `mail.ekodi.kr`

Use a nested domain when a unit needs its own independent instance.

- `mail.biz.ekodi.kr` and `mail.church.ekodi.kr`
- `live.biz.ekodi.kr` and `live.church.ekodi.kr`

## 5. Infrastructure rule

- DNS authority stays under the single Cloudflare zone `ekodi.kr`.
- Each subdomain may point to a different Cloudflare Worker, Pages project, SaaS provider, mail service, or external platform.
- A subdomain does not need to share hosting, deployment, authentication, accounting, or operations with its sibling domains.
- Prefer Cloudflare Worker Custom Domains when automatic DNS and TLS provisioning is useful for HTTP services.
- Mail MX, SPF, DKIM, and DMARC records remain DNS records and are managed separately from HTTP Worker routing.
- Keep secrets, API tokens, and credentials server-side and outside Git.

## 6. Legacy standalone domains

Existing standalone EKODI domains are retained for brand protection and transition.

After the corresponding `*.ekodi.kr` service is verified in production, the standalone domain should normally become a permanent redirect to the canonical EKODI address when its DNS zone is under EKODI Cloudflare management.

Examples:

- `ekodichurch.kr` → `church.ekodi.kr`
- `ekodilab.kr` → `lab.ekodi.kr`
- `ekodimall.kr` → `mall.ekodi.kr`
- `ekodibook.kr` → `books.ekodi.kr`
- `ekodibiz.kr` → `biz.ekodi.kr` after the legacy domain is moved under the managed Cloudflare zone

## 7. Current activation status

Production service domains:

- `books.ekodi.kr`
- `biz.ekodi.kr`
- `church.ekodi.kr`
- `lab.ekodi.kr`
- `mall.ekodi.kr`

Broadcast gateway:

- `live.church.ekodi.kr` → EKODI Church YouTube live page

Mail browser gateways:

- `mail.ekodi.kr` → Gmail
- `mail.biz.ekodi.kr` → Gmail
- `mail.church.ekodi.kr` → Gmail
- `mail.lab.ekodi.kr` → Gmail
- `mail.books.ekodi.kr` → Gmail
- `mail.trade.ekodi.kr` → Gmail

Reserved for future service deployment:

- `trade.ekodi.kr`
- `pay.ekodi.kr`
- `ins.ekodi.kr`
- `mission.ekodi.kr`
- `community.ekodi.kr`
- `live.biz.ekodi.kr`

## 8. Google Drive mirror rule

The Google Drive information architecture must mirror the EKODI domain architecture.

- The canonical Drive root folder is `ekodi.kr`.
- Every first-level service domain gets a same-named folder directly under the `ekodi.kr` Drive root.
- Every nested functional domain gets a same-named folder inside its owning service folder.
- Examples: `church.ekodi.kr/live.church.ekodi.kr`, `church.ekodi.kr/mail.church.ekodi.kr`, `biz.ekodi.kr/mail.biz.ekodi.kr`.
- When a new EKODI subdomain is activated, its matching Drive folder is created in the same change set.
- Documents, reports, schedules, media, accounting files, and project outputs should be stored by resolving the canonical service domain first and then saving under the matching Drive branch.
- Existing shared folders are not force-moved when that could break inherited access or collaborator workflows. They remain in place and are referenced from the canonical Drive structure until a safe migration is possible.
- User-owned folders with no collaboration dependency may be moved into the canonical branch while preserving their Drive file/folder IDs.
- Domain aliases and legacy standalone domains do not create separate primary Drive trees. Their content belongs under the canonical `*.ekodi.kr` folder.

This keeps DNS, web services, mail entry points, Google Drive, and operational naming aligned as one EKODI information architecture.

## 9. Customer AI workspace namespace

`ai.ekodi.kr` is reserved as the namespace for dedicated customer AI workspaces. It is intentionally separate from the shared Marketing AI product hub `marketing.ekodi.kr`.

Use the pattern:

`<customer>.ai.ekodi.kr`

Examples:

- 청계면상인회 official site: `cgma.or.kr` (EKODI route: `https://ekodi.kr/cgma`)
- 청계면상인회 AI workspace: `cgma.ai.ekodi.kr`
- Store Plus/Pro workspace: `jadam.ai.ekodi.kr`

The public website and AI workspace must be treated as separate addresses even when they belong to the same customer. This prevents a customer's public brand site from becoming technically coupled to its AI subscription.

### AI domain entitlement

- Organization/site customer workspace: dedicated `<organization>.ai.ekodi.kr`.
- Store Basic, including a store receiving Basic as an organization-member benefit: no dedicated store subdomain.
- Store Plus: dedicated `<store>.ai.ekodi.kr`.
- Store Pro: dedicated `<store>.ai.ekodi.kr` plus one customer-owned custom hostname mapping by default.
- Enterprise: custom hostname quantity and routing are contract-based.

### Customer-owned custom domain

A Pro custom domain is a hostname the customer already owns or controls, such as `ai.customer.com` or `marketing.customer.com`, mapped to the same EKODI AI workspace. EKODI does not acquire ownership of the customer's domain and domain registration/renewal is not included by default. The mapping is a branded entrance to the EKODI-hosted service, not a transfer of the underlying platform.

The customer keeps registrar and DNS ownership. EKODI manages the application-side mapping, tenant routing and HTTPS configuration required to serve the workspace through that hostname. The canonical `*.ai.ekodi.kr` hostname remains the platform identity while the plan entitlement is active.
