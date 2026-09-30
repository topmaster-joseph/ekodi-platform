# EKODI Cloud Connection Operations

## Decision

Opera Browser Connector is an optional last-resort adapter, not an EKODI operational dependency. EKODI operations must remain usable when Opera is closed, disconnected, expired, or unavailable.

Remote desktop is also a secondary execution adapter, not the default execution plane. Work that can be completed through an official API, connected plugin/API, server-side OAuth, workload identity, CI/CD or another authorized cloud path must not consume remote-desktop quota merely for convenience.

## Default path

1. Official provider API
2. Connected ChatGPT/plugin capability, including GitHub API access
3. Server-side OAuth with provider-supported refresh
4. Workload identity or service-account reference
5. Cloud browser / CI/CD execution where appropriate
6. Authorized remote desktop only for genuinely local-only work
7. Opera Browser Connector only when explicitly enabled and browser-local context is actually required

The runtime must automatically fail over to the next authorized provider when the preferred path is unavailable.

## Quota-aware continuity

- A provider rate limit, monthly usage limit, quota exhaustion or temporary execution cap is a recoverable interruption, not a completed or permanently blocked task.
- If a provider reports zero remaining quota, or invocation fails with a recognized quota/rate-limit condition, mark that provider unavailable for the current task and continue through the next authorized path.
- Remote desktop is skipped when its reported remaining quota is `0%` or lower. A second registered device must not be used merely to evade an account-level quota unless it has an independently authorized quota boundary.
- GitHub/API/CI/CD and other cloud paths remain preferred for repository inspection, code changes, branches, commits, pull requests, tests, workflow checks and deployments that do not require local GUI state.
- Local-only operations should be batched into the fewest practical remote calls. Repeated tiny process launches, file reads/writes or polling loops should be replaced by one script, workflow or grouped command where doing so remains observable and reversible.
- A remote-desktop quota event must be recorded as a degraded-provider reason so the orchestrator can explain why it changed routes without treating the task as failed.

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

Provider availability may also carry an operational reason such as `quota_exhausted`, `rate_limited`, `disabled` or `provider_error`; these reasons explain routing without creating a second authority model.

## Opera policy

`OPERA_BROWSER_CONNECTOR_ENABLED` defaults to disabled. Enabling it makes Opera eligible only after higher-priority cloud paths. Disabling or losing Opera must never disable an EKODI core service.

## Implementation

The canonical runtime is `cloud-connection-runtime.js`; the machine-readable policy is `config/cloud-connection-policy.json`; regression coverage is in `test/cloud-connection-runtime.test.mjs`.
