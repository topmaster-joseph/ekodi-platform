# Marketing AI customer domain registry

EKODI Marketing AI uses one tenant address policy for individuals, stores, companies, institutions and groups. Customer type changes the entitlement and management role, not the URL model.

## Canonical hierarchy

- `ekodi.kr/ekodibiz/marketing-ai` = EKODIBIZ가 제공하는 Marketing AI 상품·가입·체험의 공개 canonical entry.
- `ekodi.kr/{public_namespace}/marketing` = 각 사용자/매장/기관의 실제 Marketing 서비스 canonical surface.
- `marketing.ekodi.kr` = EKODI Marketing Core 공통엔진. 일반 고객의 정체성이나 대표 진입주소가 아니다.
- `ai.ekodi.kr` = provider-independent EKODI AI Gateway / Orchestrator. 일반 고객은 내부 provider/model 선택을 알 필요가 없다.
- 기존 `<tenant>.ai.ekodi.kr` = migration 중인 compatibility execution alias일 뿐 새 canonical naming standard가 아니다.
- 고객 소유 hostname = 선택적 custom alias이며 동일한 immutable `workspace_id`에 매핑한다.

Examples:

- 자담치킨 목포대점: `ekodi.kr/jadam` → Marketing: `ekodi.kr/jadam/marketing`
- 피자마루 목포대점: `ekodi.kr/pizzamaru` → Marketing: `ekodi.kr/pizzamaru/marketing`
- 요거트퍼플 목포대점: `ekodi.kr/yogurt` → Marketing: `ekodi.kr/yogurt/marketing`
- 청계면상인회: `ekodi.kr/cgma` → Marketing: `ekodi.kr/cgma/marketing`

## Plan and domain entitlement

Plan/tier determines capability, quota and automation entitlement, not the public URL grammar. Free, Plus, Pro, AUTO and Enterprise all keep the same workspace canonical path. A higher plan may add a customer-owned custom domain, but it does not create a new EKODI tenant/AI subdomain identity.

## Pro customer-owned domain policy

`customDomain: true` does not mean EKODI purchases, gives away or takes ownership of a domain for the customer.

A Pro-or-higher customer who owns or controls a domain may map a subdomain such as:

- `ai.customer-domain.com`
- `marketing.customer-domain.com`

The customer keeps domain ownership and registrar control. EKODI provides the mapping to the entitled Marketing AI workspace, Cloudflare Pages custom-domain registration, HTTPS activation checks and tenant-safe lifecycle management. Domain registration and renewal fees are not included unless a separate contract explicitly says otherwise.

For safety and compatibility the self-service flow accepts customer-owned **subdomains**, not apex/root domains. EKODI and provider namespaces such as `*.ekodi.kr`, `*.pages.dev` and `*.workers.dev` cannot be claimed through this flow.

## Self-service connection lifecycle

The customer experience is intentionally short:

1. Sign in with the EKODI Google identity on the entitled workspace.
2. Open `내 도메인 연결` and enter a customer-owned hostname.
3. EKODI verifies that the current person/tenant has an active Marketing AI Pro-or-higher subscription and domain-management permission.
4. EKODI registers the hostname server-side with the workspace's Cloudflare Pages project.
5. EKODI returns one CNAME instruction. The customer adds that record at their registrar/DNS provider.
6. The customer selects `연결 확인`, or the scheduled verifier checks automatically.
7. When Cloudflare reports the hostname active, EKODI marks the mapping active and HTTPS is available.

Provider credentials never go to the browser. The dedicated service is `marketing-api.ekodi.kr`; its public customer endpoints are:

- `GET /api/marketing/domains?tenant=<tenant>`
- `POST /api/marketing/domains`
- `POST /api/marketing/domains/<id>/verify`
- `DELETE /api/marketing/domains/<id>`

The API accepts an authenticated person's own subscription or an authorized tenant. Tenant domain changes are limited to owner/HQ/client-admin roles. A Pro/AUTO workspace gets one mapping by default; Enterprise can be expanded by contract.

If the subscription no longer qualifies, the scheduled lifecycle worker disconnects the customer-owned hostname while retaining the customer's data according to the separate retention policy. Downgrading from Pro to Plus therefore removes the customer-owned hostname but can retain `<tenant>.ai.ekodi.kr`; downgrading to Basic can separately remove the dedicated EKODI hostname entitlement.

## Workspace registry

The commercial/domain policy source of truth is `config/marketing-tenants.json`. Runtime custom-domain state is stored in the shared D1 tables `marketing_workspaces`, `marketing_custom_domains` and `marketing_domain_audit`.

Current canonical Marketing surfaces include:

- `ekodi.kr/jadam/marketing` → Cloudflare Pages project `marketing-ai-jadam`
- `ekodi.kr/pizzamaru/marketing` → Cloudflare Pages project `marketing-ai-pizzamaru`
- `ekodi.kr/yogurt/marketing` → Cloudflare Pages project `marketing-ai-yogurtpurple`
- `ekodi.kr/cgma/marketing` → Cloudflare Pages project `cheonggye-market`, upstream landing at `/market-ai`

Existing production `*.ai.ekodi.kr` aliases are retained only during migration so current links do not break. They are compatibility execution addresses, not the naming standard.

Marketing AI uses the public product name `마케팅AI` and the common footer `Powered by EKODIBIZ`.
