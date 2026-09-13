# EKODI Cloud Connection Operations

## Decision

Opera Browser Connector is an optional last-resort adapter, not an EKODI operational dependency. EKODI operations must remain usable when Opera is closed, disconnected, expired, or unavailable.

## Default path

1. Official provider API
2. Connected ChatGPT/plugin capability
3. Server-side OAuth with provider-supported refresh
4. Workload identity or service-account reference
5. Cloud browser
6. Authorized remote desktop
7. Opera Browser Connector only when explicitly enabled and browser-local context is actually required

The runtime must automatically fail over to the next authorized provider when the preferred path is unavailable.

## Authentication boundary

EKODI must never bypass login, user consent, MFA, or provider-required reauthentication. Automatic recovery is limited to mechanisms explicitly supported by the provider, such as refresh tokens, managed identities, workload identity, or server-to-server credentials.

When every authorized alternative has been exhausted, request only the minimum user action needed to restore the provider connection.

## Credential handling

- Never store provider secrets in browser storage, source code, Git, or client-visible configuration.
- Store refresh tokens and server credentials only in encrypted server-side storage or a managed secret store.
- Keep registry records separate from secret material; registry rows should contain credential references rather than raw credentials.
- Scope credentials to the least privilege required and rotate/revoke them through the provider's supported mechanism.

## Connection state model

- `connected`: ready for immediate use.
- `refreshable`: server-side refresh may be attempted without user interaction.
- `needs_user_auth`: login, consent, MFA, or reauthentication is required; do not bypass it.
- `unavailable`: skip and try the next authorized provider.

## Opera policy

`OPERA_BROWSER_CONNECTOR_ENABLED` defaults to disabled. Enabling it makes Opera eligible only after higher-priority cloud paths. Disabling or losing Opera must never disable an EKODI core service.

## Implementation

The canonical runtime is `cloud-connection-runtime.js`; the machine-readable policy is `config/cloud-connection-policy.json`; regression coverage is in `test/cloud-connection-runtime.test.mjs`.
