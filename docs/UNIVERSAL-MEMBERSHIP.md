# EKODI Universal Membership

## Product rule

EKODI uses one ecosystem account and many independently operated services.

**One Account · Free Everywhere · Pay Where Needed**

1. A user signs in through the EKODI Google-centered authentication flow once.
2. Every user-facing service registered in `config/ecosystem-services.json` is available at the FREE entitlement level by default.
3. FREE eligibility is projected immediately and materialized in `service_subscriptions` only when the user first uses a service. This avoids creating unused rows for every account/service combination.
4. Paid tiers are not ecosystem-wide. Each service owns its own paid plan catalog, price, billing eligibility and capability limits.
5. Upgrading one service never silently upgrades an unrelated service. However, a capability already granted to the same subject is reusable anywhere that exact capability is surfaced, including 모두의 AI and the owning specialist site.
6. My EKODI at `https://ekodi.kr/my/` is the canonical place to view person/workspace service plans and effective AI capability entitlements, then hands execution to the owning specialist service.
7. Admin, Auth, API, Core, Security and other infrastructure are not user services and never inherit consumer membership.
8. On common-service user pages, guests see only a service guide. Actual content and functions require a Google-authenticated FREE member or higher.
9. Customer-owned/operated sites keep their own access policy, and administrator/internal surfaces are outside this user-page rule.

## Automatic inheritance

`config/ecosystem-services.json` is the canonical registry for EKODI user-facing services.

`npm run generate:user-services` creates ephemeral build/deploy artifacts (not committed):

- `generated/user-services.js` for the server membership runtime
- `my/user-services.js` for My EKODI

The generator rejects reserved infrastructure identifiers, duplicate ids/domains and non-EKODI user domains.

`npm run check` regenerates the registry before validation. Therefore a future service added to the ecosystem registry automatically becomes part of the FREE membership portfolio without editing the membership runtime or My EKODI by hand.

## Runtime

`universal-membership.js` sits in front of the existing `membership-billing.js` implementation.

- Existing service-specific billing behavior is preserved.
- Existing Marketing AI paid tiers remain delegated to the existing billing implementation.
- Registry services without a paid catalog receive the universal FREE plan only.
- `/api/membership/portfolio` returns every registered user service. A service without a stored subscription row is reported as inherited FREE eligibility.
- `/api/membership/me?site=<id>` lazily materializes a FREE subscription for registry services that do not yet have a specialist billing implementation.
- Registry service origins are accepted for this membership surface without requiring a second hand-maintained CORS list.

## My EKODI

My EKODI adds a compact Universal Membership summary above the existing platform cards.

It shows:

- the common FREE default
- all current registry services
- the effective per-service tier when a stored personal subscription exists
- direct links back to the owning service

Workspace-specific access remains separate from person-level universal membership. A signed-in person may switch the entitlement subject between the personal account and organizations/workspaces they belong to. Rights never bleed from one subject into another. My EKODI does not copy specialist private data into a new central store.

## Billing principle

Universal membership standardizes **eligibility**, not pricing.

A new service can launch safely with FREE only. When paid functionality is ready, that service adds its own paid catalog and server-side entitlement checks. Billing must continue to fail closed when price, payment contract or authorization cannot be verified.

## Change rule for future services

For a normal user-facing service:

1. register it once in `config/ecosystem-services.json`
2. use the shared Google/SSO and Shell contracts
3. ship its FREE capabilities
4. add paid tiers only if/when that service needs them

The registry generator and universal-membership validator handle the common membership plumbing automatically.


## Central AI entitlement rule

AI billing and AI capability access are related but not identical.

- The service subscription remains owned by the service that sells it.
- The central entitlement engine derives the effective AI capability level for the selected subject.
- The canonical management surface is `https://ekodi.kr/my/`; `my.ekodi.kr` is not the canonical My EKODI address.
- The same person can act as a personal subject or as an authorized organization/workspace subject.
- If the same capability identifier is exposed in both 모두의 AI and an owning site, the selected subject uses one entitlement. The UI must not ask the same subject to buy that capability again merely because the surface changed.
- Site-specific add-ons remain scoped to that site and do not become ecosystem-wide rights.
- The owning service remains the final server-side execution gate. The central entitlement snapshot is a shared decision layer, not a bypass around specialist authorization.
