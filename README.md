# EKODI Platform v4.3

Production-oriented operating platform for the EKODI ecosystem.

EKODI is designed around a **service-first, AI-enhanced** principle: ordinary users receive a simple signed-in experience through `my.ekodi.kr`, administrators receive a separate private control plane through `admin.ekodi.kr`, and core services continue to operate even when external AI providers are unavailable.

## Product surfaces

- Public front door: https://ekodi.kr
- Signed-in personal home: https://my.ekodi.kr
- Private control plane: https://admin.ekodi.kr
- Shared control/data API: https://api.ekodi.kr
- Shared EKODI Shell: https://shell.ekodi.kr

The canonical identity model is `Person + Space + Role + Capability`. A person can participate in personal, business, organization, church, community, or project Workspaces without creating a separate identity for every service.

## Sustainable operating model

```text
People
  ├─ ekodi.kr       public front door
  └─ my.ekodi.kr    signed-in experience plane
                          │
                          ▼
                Identity / Workspace context
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Community          Business          Knowledge / Life
   Church             Marketing         Books / Creator
   Social             Mall / Trade      Lab / Work / Energy
        └─────────────────┬─────────────────┘
                          ▼
                 Stable provider-independent core
                          │
                          ▼
             Replaceable AI / automation layer

Administrators
  └─ admin.ekodi.kr  private control plane
         ├─ health / domains / access
         ├─ deployments / audit / recovery
         └─ AI operations / resilience / manual fallback
```

The detailed contract is documented in `docs/SUSTAINABLE-OPERATING-MODEL.md`.

## AI resilience

The platform enforces these invariants:

- external AI providers are not required for core service;
- provider failure must degrade assistance, not disable the service;
- first fallback mode is `free_assist`;
- final fallback mode is `core`;
- provider secrets are never allowed in the browser;
- provider calls have timeout and circuit-breaker behavior;
- guarded releases execute a no-provider survival gate with `AI_PROVIDER=NONE`.

The machine-readable policy is `config/ai-provider-independence.json` and the runtime is `ai-resilience-runtime.js`.

## Shared EKODI Shell

User-facing services follow a shared Shell policy to keep identity context, Workspace switching, safe navigation, and service boundaries consistent. New active services cannot bypass the Shell contract. Existing legacy services marked `pending` are migration debt and must move through staging and guarded release before being considered fully adopted.

See `docs/ekodi-shell-contract.md` and `ekodi-service-manifest.js`.

## Platform isolation

EKODI services are independent platforms or specialized services, not cosmetic pages in a single release unit.

- normal source changes deploy only the owning platform;
- shared runtimes require cross-domain regression checks;
- private platform or tenant data is not accessed directly by another platform;
- shared database changes are treated as shared-core changes;
- platform ownership and deployment boundaries are governed by `platform-boundaries.json`.

## Production safeguards

The repository includes:

- Node syntax and source validation
- automated tests
- AI mission-governance validation
- AI provider-independence validation
- `AI_PROVIDER=NONE` survival tests
- platform-boundary validation
- security-baseline validation
- EKODI Shell adoption validation
- staging-specific Wrangler configurations
- guarded Worker and Pages release scripts
- service monitoring and operational audit controls

Direct production deployment paths are intentionally blocked where a guarded workflow is required.

## Local verification

Requires Node.js 20 or newer; CI uses Node.js 24.

```bash
npm run check
npm test
npm run test:ai-none
npm run dev
```

## Definition of done

For production-impacting work, a successful commit or deploy command alone is not completion. Applicable work must pass source validation and automated tests, use staging and guarded promotion, verify the real public hostname, preserve security and tenant boundaries, and remain observable from the administrator control plane.

## Domain policy

`ekodi.kr` is the primary digital root. New services should normally use EKODI subdomains rather than new standalone domains. Organization-specific functions may use hierarchical service subdomains such as `mail.biz.ekodi.kr` or `live.church.ekodi.kr` when an explicit product contract requires them.

Existing standalone EKODI domains may remain for brand protection or transition and should redirect to canonical EKODI addresses where appropriate.

## Security

Keep privileged provider credentials, DNS tokens, payment secrets, and service keys server-side. Production browser origins must be explicitly allowed, administrator surfaces must retain restrictive security headers, and privileged or destructive agent actions remain subject to mission governance and human gates.
