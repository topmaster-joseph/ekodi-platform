# Marketing AI customer domain registry

EKODI Marketing AI uses one tenant address policy for individuals, stores, companies, institutions and groups. Customer type changes the entitlement and management role, not the URL model.

## Canonical hierarchy

- `marketing.ekodi.kr` = shared Marketing AI product hub, free entry and plan selection.
- `marketing.ekodi.kr/<tenant>` = Free/Basic workspace entry for an individual, store, company, institution or group.
- `ai.ekodi.kr` = reserved namespace for dedicated EKODI customer AI workspaces.
- `<tenant>.ai.ekodi.kr` = Plus-or-higher dedicated EKODI AI workspace address.
- Customer-owned hostname = Pro-or-higher optional alias mapped to the same workspace.

A customer's public website and its AI workspace are separate products and may use separate hostnames.

Example:

- `cgma.or.kr` = 청계면상인회 external public domain; EKODI platform route is `https://ekodi.kr/cgma`.
- `marketing.ekodi.kr/cgma` = shared/Basic Marketing AI entry model.
- `cgma.ai.ekodi.kr` = dedicated Marketing AI workspace when the organization has the dedicated entitlement.

## Plan and domain entitlement

| Customer state | EKODI Marketing AI address | Customer-owned domain |
|---|---|---|
| Free / Basic | `marketing.ekodi.kr/<tenant>` | No |
| Plus | `<tenant>.ai.ekodi.kr` | No |
| Pro | `<tenant>.ai.ekodi.kr` | Yes, 1 mapped hostname by default |
| AUTO / Enterprise | Dedicated EKODI AI address | Pro-level or contract-based mappings |

An organization can include Basic member workspaces without issuing one DNS hostname per member store. A member store receives its own `<store>.ai.ekodi.kr` only when it has the required dedicated-domain entitlement.

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

Current dedicated AI workspace targets include:

- `jadam.ai.ekodi.kr` → Cloudflare Pages project `marketing-ai-jadam`
- `pizzamaru.ai.ekodi.kr` → Cloudflare Pages project `marketing-ai-pizzamaru`
- `yogurt.ai.ekodi.kr` → Cloudflare Pages project `marketing-ai-yogurtpurple`
- `cgma.ai.ekodi.kr` → Cloudflare Pages project `cheonggye-market`, landing at `/market-ai`

Existing production aliases are retained during migration so current links do not break. They are compatibility addresses, not the new naming standard.

Marketing AI uses the public product name `마케팅AI` and the common footer `Powered by EKODIBIZ`.
