# Marketing AI routing and domain policy

EKODI separates user-facing identity from engine topology.

## Canonical user routes

- `ekodi.kr/ekodibiz/marketing-ai` = EKODIBIZ Marketing AI product, introduction, signup and general entry.
- `ekodi.kr/{public_namespace}/marketing` = canonical workspace Marketing surface.
- `ekodi.kr/jadam/marketing` = Jadam canonical Marketing surface.
- `ekodi.kr/pizzamaru/marketing` = Pizzamaru canonical Marketing surface.
- `ekodi.kr/yogurt/marketing` = Yogurt canonical Marketing surface.
- `ekodi.kr/cgma/marketing` = CGMA canonical Marketing surface.

Workspace identity remains the immutable `workspace_id`. The slug and URL are routing locators only.

## Engine boundaries

- `marketing.ekodi.kr` = EKODI Marketing Core common-service engine boundary.
- `ai.ekodi.kr` = provider-independent EKODI AI Gateway/Core boundary.
- `<tenant>.ai.ekodi.kr` = compatibility execution alias only, never a canonical customer URL.

Ordinary user surfaces must not expose provider, model, orchestration or internal execution topology. Internal admin, API, observability and deployment systems may reference engine addresses when operationally required.

## Customer-owned domains

A customer-owned hostname may map to the same authorized workspace without changing EKODI identity or authorization truth. The customer retains registrar and domain ownership.

CGMA keeps `cgma.or.kr` as its customer-owned public domain and `https://ekodi.kr/cgma` as its EKODI platform route. Its Marketing workspace remains `https://ekodi.kr/cgma/marketing`.

## Compatibility execution aliases

The current execution aliases remain registered so existing deployments and bookmarks do not break:

- `jadam.ai.ekodi.kr`
- `pizzamaru.ai.ekodi.kr`
- `yogurt.ai.ekodi.kr`
- `cgma.ai.ekodi.kr`

These aliases may proxy or redirect to the same authorized service, but new customer-facing links must use the canonical `ekodi.kr/{public_namespace}/marketing` path.

## Custom-domain lifecycle

Pro-or-higher customers may map a customer-owned subdomain such as `ai.customer-domain.com` or `marketing.customer-domain.com` when the entitlement permits it. EKODI performs authorization, provider registration, HTTPS verification and lifecycle checks server-side. Provider credentials never go to the browser.

The commercial/domain source of truth is `config/marketing-tenants.json`. Runtime domain state remains in the approved Marketing domain service and its audited operational store.

## Release rule

A release fails when an ordinary user surface reintroduces `marketing.ekodi.kr` as the product/customer entry or a customer-specific `*.ai.ekodi.kr` address as canonical. `npm run validate:user-surfaces` enforces this contract together with the constitutional validator.
