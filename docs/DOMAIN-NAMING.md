# EKODI Domain Naming Standard

`ekodi.kr` is the canonical digital root of the EKODI ecosystem.

## 1. First-level service domains

Use a first-level subdomain when the service is an ecosystem-wide brand, platform, or shared capability.

| Purpose | Canonical address |
|---|---|
| Business | `ekodi.kr/ekodibiz` |
| Trading | `ekodi.kr/ekodibiz/trade` |
| Mall | `ekodi.kr/ekodimall` |
| Payments | `ekodi.kr/pay` |
| Books | `ekodi.kr/books` |
| Lab | `ekodi.kr/ekodilab` |
| Church | `ekodi.kr/ekodichurch` |
| Mission | `ekodi.kr/mission` |
| Community | `ekodi.kr/community` |
| Insurance | `ekodi.kr/ins` |
| Education | `ekodi.kr/education` |
| Media | `ekodi.kr/media` |
| Events | `ekodi.kr/event` |
| Giving | `ekodi.kr/give` |
| Administration | `ekodi.kr/admin` |
| Shared API | `ekodi.kr/api` |
| Shared webmail entry | `ekodi.kr/mail` |

## 2. Nested functional domains

When the same function can exist independently inside multiple EKODI units, use:

`<function>.<unit>.ekodi.kr`

Examples:

- Church live broadcast: `ekodi.kr/ekodichurch/live`
- Business live broadcast: `ekodi.kr/ekodibiz/live`
- Church webmail entry: `ekodi.kr/ekodichurch/mail`
- Business webmail entry: `ekodi.kr/ekodibiz/mail`
- Church administration: `ekodi.kr/ekodichurch/admin`
- Business administration: `ekodi.kr/ekodibiz/admin`
- Business API: `ekodi.kr/api/ekodibiz`
- Trading API: `ekodi.kr/api/ekodibiz/trade`

This allows identical functions such as `live`, `mail`, `admin`, and `api` to be operated independently while remaining under one `ekodi.kr` zone.

## 3. Mail architecture

Webmail entry hostnames and email-address domains are intentionally separate.

### Webmail entry domains

The following hostnames are stable browser entry points and currently redirect to Google Gmail. They can later be retargeted without changing the public address.

- `ekodi.kr/mail` — shared EKODI mail entry
- `ekodi.kr/ekodibiz/mail` — EKODI Biz mail entry
- `ekodi.kr/ekodichurch/mail` — EKODI Church mail entry
- `ekodi.kr/ekodilab/mail` — EKODI Lab mail entry
- `ekodi.kr/books/mail` — EKODI Books mail entry
- `ekodi.kr/ekodibiz/trade/mail` — EKODI Trading mail entry

### Email-address domains

Do not create user addresses such as `user@ekodi.kr/ekodibiz/mail` unless there is a specific technical reason. The preferred address pattern is:

- EKODI root identity: `user@ekodi.kr`
- Business: `user@ekodi.kr/ekodibiz`
- Church: `user@ekodi.kr/ekodichurch`
- Lab: `user@ekodi.kr/ekodilab`
- Books: `user@ekodi.kr/books`
- Trading: `user@ekodi.kr/ekodibiz/trade`

Each address domain can be added to Google Workspace as a secondary domain or domain alias according to the organizational requirement. Incoming mail requires MX records on the email-address domain itself, not on the `mail.*` browser-entry hostname.

For Google Workspace, keep SPF, DKIM, and DMARC aligned with every domain that is enabled for sending mail.

### Recommended rollout

1. Keep the currently operating `@ekodibiz.kr` Workspace mail unchanged during migration.
2. Add `ekodi.kr/ekodibiz` to Google Workspace and verify domain ownership before enabling mail on it.
3. Add the required MX and authentication records for `ekodi.kr/ekodibiz`.
4. Test sending and receiving before making new addresses public.
5. Repeat for `ekodi.kr/ekodichurch`, `ekodi.kr/ekodilab`, `ekodi.kr/books`, and `ekodi.kr/ekodibiz/trade` only when each unit actually needs its own mail identity.
6. Keep `mail.*` URLs as stable browser gateways independent of the underlying mail provider.

## 4. Shared vs unit-specific rule

Use a first-level domain when one service is shared across the whole ecosystem.

- Shared payments: `ekodi.kr/pay`
- Shared identity/admin: `ekodi.kr/admin`
- Shared API gateway: `ekodi.kr/api`
- Shared webmail entry: `ekodi.kr/mail`

Use a nested domain when a unit needs its own independent instance.

- `ekodi.kr/ekodibiz/mail` and `ekodi.kr/ekodichurch/mail`
- `ekodi.kr/ekodibiz/live` and `ekodi.kr/ekodichurch/live`

## 5. Infrastructure rule

- DNS authority stays under the single Cloudflare zone `ekodi.kr`.
- Each subdomain may point to a different Cloudflare Worker, Pages project, SaaS provider, mail service, or external platform.
- A subdomain does not need to share hosting, deployment, authentication, accounting, or operations with its sibling domains.
- Prefer Cloudflare Worker Custom Domains when automatic DNS and TLS provisioning is useful for HTTP services.
- Mail MX, SPF, DKIM, and DMARC records remain DNS records and are managed separately from HTTP Worker routing.
- Keep secrets, API tokens, and credentials server-side and outside Git.

## 6. Legacy standalone domains

Existing standalone EKODI domains are retained for brand protection and transition.

After the corresponding `EKODI child-host address` service is verified in production, the standalone domain should normally become a permanent redirect to the canonical EKODI address when its DNS zone is under EKODI Cloudflare management.

Examples:

- `ekodichurch.kr` → `ekodi.kr/ekodichurch`
- `ekodilab.kr` → `ekodi.kr/ekodilab`
- `ekodimall.kr` → `ekodi.kr/ekodimall`
- `ekodibook.kr` → `ekodi.kr/books`
- `ekodibiz.kr` → `ekodi.kr/ekodibiz` after the legacy domain is moved under the managed Cloudflare zone

## 7. Current activation status

Production service domains:

- `ekodi.kr/books`
- `ekodi.kr/ekodibiz`
- `ekodi.kr/ekodichurch`
- `ekodi.kr/ekodilab`
- `ekodi.kr/ekodimall`

Broadcast gateway:

- `ekodi.kr/ekodichurch/live` → EKODI Church YouTube live page

Mail browser gateways:

- `ekodi.kr/mail` → Gmail
- `ekodi.kr/ekodibiz/mail` → Gmail
- `ekodi.kr/ekodichurch/mail` → Gmail
- `ekodi.kr/ekodilab/mail` → Gmail
- `ekodi.kr/books/mail` → Gmail
- `ekodi.kr/ekodibiz/trade/mail` → Gmail

Reserved for future service deployment:

- `ekodi.kr/ekodibiz/trade`
- `ekodi.kr/pay`
- `ekodi.kr/ins`
- `ekodi.kr/mission`
- `ekodi.kr/community`
- `ekodi.kr/ekodibiz/live`

## 8. Google Drive mirror rule

The Google Drive information architecture must mirror the EKODI domain architecture.

- The canonical Drive root folder is `ekodi.kr`.
- Every first-level service domain gets a same-named folder directly under the `ekodi.kr` Drive root.
- Every nested functional domain gets a same-named folder inside its owning service folder.
- Examples: `ekodi.kr/ekodichurch/ekodi.kr/ekodichurch/live`, `ekodi.kr/ekodichurch/ekodi.kr/ekodichurch/mail`, `ekodi.kr/ekodibiz/ekodi.kr/ekodibiz/mail`.
- When a new EKODI subdomain is activated, its matching Drive folder is created in the same change set.
- Documents, reports, schedules, media, accounting files, and project outputs should be stored by resolving the canonical service domain first and then saving under the matching Drive branch.
- Existing shared folders are not force-moved when that could break inherited access or collaborator workflows. They remain in place and are referenced from the canonical Drive structure until a safe migration is possible.
- User-owned folders with no collaboration dependency may be moved into the canonical branch while preserving their Drive file/folder IDs.
- Domain aliases and legacy standalone domains do not create separate primary Drive trees. Their content belongs under the canonical `EKODI child-host address` folder.

This keeps DNS, web services, mail entry points, Google Drive, and operational naming aligned as one EKODI information architecture.

## 9. Customer AI workspace namespace

`ekodi.kr/ai` is reserved as the namespace for dedicated customer AI workspaces. It is intentionally separate from the shared Marketing AI product hub `ekodi.kr/marketing`.

Use the pattern:

`<customer>.ekodi.kr/ai`

Examples:

- 청계면상인회 official site: `cgma.or.kr` (EKODI route: `https://ekodi.kr/cgma`)
- 청계면상인회 AI workspace: `ekodi.kr/cgma/marketing`
- Store Plus/Pro workspace: `ekodi.kr/jadam/marketing`

The public website and AI workspace must be treated as separate addresses even when they belong to the same customer. This prevents a customer's public brand site from becoming technically coupled to its AI subscription.

### AI domain entitlement

- Organization/site customer workspace: dedicated `<organization>.ekodi.kr/ai`.
- Store Basic, including a store receiving Basic as an organization-member benefit: no dedicated store subdomain.
- Store Plus: dedicated `<store>.ekodi.kr/ai`.
- Store Pro: dedicated `<store>.ekodi.kr/ai` plus one customer-owned custom hostname mapping by default.
- Enterprise: custom hostname quantity and routing are contract-based.

### Customer-owned custom domain

A Pro custom domain is a hostname the customer already owns or controls, such as `ai.customer.com` or `marketing.customer.com`, mapped to the same EKODI AI workspace. EKODI does not acquire ownership of the customer's domain and domain registration/renewal is not included by default. The mapping is a branded entrance to the EKODI-hosted service, not a transfer of the underlying platform.

The customer keeps registrar and DNS ownership. EKODI manages the application-side mapping, tenant routing and HTTPS configuration required to serve the workspace through that hostname. The canonical `EKODI child-host address/ai` hostname remains the platform identity while the plan entitlement is active.
