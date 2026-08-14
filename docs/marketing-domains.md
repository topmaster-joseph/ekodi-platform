# Marketing AI customer domain registry

EKODI Marketing AI separates the shared product hub, organization/customer AI workspaces, store plan entitlements, and customer-owned custom domains.

## Canonical hierarchy

- `marketing.ekodi.kr` = shared Marketing AI product hub, free entry, plan selection and shared workspace entry.
- `ai.ekodi.kr` = reserved namespace for dedicated EKODI customer AI workspaces. It is a namespace, not a store or organization by itself.
- `<organization>.ai.ekodi.kr` = organization/site-customer AI workspace.
- `<store>.ai.ekodi.kr` = store-specific dedicated AI workspace when the store has Plus, Pro, Enterprise, or an explicitly grandfathered entitlement.

A customer's public website and its AI workspace are separate products and may therefore use separate hostnames.

Example:

- `cgma.ekodi.kr` = 청계면상인회 official/public website.
- `cgma.ai.ekodi.kr` = 청계면상인회 Marketing AI workspace.

## Plan and domain entitlement

| Customer state | Dedicated EKODI AI domain | Customer-owned custom domain |
|---|---|---|
| Organization/site customer workspace | `<organization>.ai.ekodi.kr` | By contract/plan |
| Store Basic, including organization member Basic benefit | No store-specific domain | No |
| Store Plus | `<store>.ai.ekodi.kr` | No |
| Store Pro | `<store>.ai.ekodi.kr` | Yes, 1 mapped hostname by default |
| Enterprise | Dedicated EKODI AI domain | Contract-based multiple mappings |

Basic users do not lose their data. They use the organization workspace or shared Marketing AI hub without reserving a store-specific DNS name.

## Pro custom-domain policy

`customDomain: true` does **not** mean that EKODI purchases, gives away, or takes ownership of a domain for the customer.

It means that a Pro customer who already owns or controls a domain may point one hostname to the same EKODI Marketing AI workspace, for example:

- `ai.customer-domain.com`
- `marketing.customer-domain.com`

The customer keeps domain ownership and registrar control. EKODI provides hostname mapping, tenant routing and HTTPS connection to the Pro workspace. Domain registration fees and renewal fees are not included unless a separate contract explicitly says otherwise.

The canonical EKODI address remains available while the entitled plan is active. If Pro is downgraded to Plus, the customer-owned custom hostname can be disconnected while `<store>.ai.ekodi.kr` remains. If the store is downgraded to Basic, the dedicated store hostname entitlement also ends and the workspace returns to the organization/shared entry path. Data retention follows the subscription and retention policy rather than DNS naming.

## Current registry

The machine-readable source of truth is `config/marketing-tenants.json`.

Current dedicated AI workspace targets include:

- `jadam.ai.ekodi.kr` → Cloudflare Pages project `marketing-ai-jadam`
- `pizzamaru.ai.ekodi.kr` → Cloudflare Pages project `marketing-ai-pizzamaru`
- `yogurt.ai.ekodi.kr` → Cloudflare Pages project `marketing-ai-yogurtpurple`
- `cgma.ai.ekodi.kr` → Cloudflare Pages project `cheonggye-market`, landing at `/ai`

Existing production aliases are retained during migration so current links do not break. They are compatibility addresses, not the new naming standard.

Marketing AI uses the public product name `마케팅AI` and the common footer `Powered by EKODIBIZ`.
