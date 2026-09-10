# EKODI Admin OS authorization contract

## Purpose

EKODI Admin is one shared operating engine. Different administrator URLs and views are entry contexts into that engine, not separate authorization systems.

The canonical authorization tuple is:

`Identity + Authority Scope + Capability + Resource Scope + Elevation`

A selected UI context is deliberately **not** part of the grant. Context tells the Admin OS what the administrator is looking at. Server authority determines what the administrator may actually do.

## Roles are presets

Platform roles remain human-readable presets:

- `super_admin`: global platform administration and governance capabilities.
- `operator`: normal cross-platform operating capabilities without privileged platform administration.
- `viewer`: read and observation capabilities.

The server resolves these presets into capabilities with `ekodi-authorization.js`. Explicit deny wins over wildcard allow.

## Contexts

The Admin OS exposes three context types:

- `platform:global`
- `workspace:{slug}`
- `service:{id}`

The context selector is populated from the authenticated customer/workspace directory and the public EKODI service registry. The selected value is kept in session storage and may also be represented in the `context` query parameter for deep links.

Changing context never grants authority. Modules receive `ekodi-admin-context-changed` and must still enforce authorization in their owning server API.

## Privileged operations

High-risk capabilities are not continuously active, even for a super administrator. Sensitive capabilities include administrator-account mutation, security-policy changes, secret changes, restore, production deployment/rollback and emergency platform actions.

A sensitive action returns `ELEVATION_REQUIRED` unless the current session has a temporary privileged state. The Admin OS then performs a fresh Google proof with the same administrator identity, keeps the administrator on the current screen, and retries the original action automatically.

Privileged state lasts 15 minutes and is stored server-side against the hashed administrator session token. It can also be revoked explicitly.

## Failure boundaries

The authenticated shell must remain usable when the navigation runtime is delayed or unavailable. A navigation-runtime failure marks the document as degraded and preserves the base admin shell instead of replacing the entire content area with an error page. Lazy modules remain isolated and may recover independently.

## Server enforcement

UI visibility is convenience only. Authorization is always enforced in the API that owns the mutation. Current platform administrator account management is capability-gated server-side, and future protected endpoints should use the same authorization contract rather than creating new role-specific conditionals.

## Migration rule

Existing workspace roles and service-specific roles are not deleted. They should progressively map to capability bundles at their owning service boundary. This allows EKODI to preserve familiar role names while converging on one policy language without coupling independent services to one UI implementation.
