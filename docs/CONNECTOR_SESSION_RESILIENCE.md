# EKODI Connector Session Resilience

## Principle
External connectors such as Opera Browser Connector should remain usable with the least possible interruption. EKODI treats connector availability as an operational dependency, not as a one-off login.

## Connection lifecycle
1. Prefer supported refresh-token or long-lived credential flows over repeatedly issuing short-lived interactive sessions.
2. Never bypass an OAuth provider's required re-authentication, consent, MFA, revocation, or device trust controls.
3. Track connector health separately from EKODI user sessions.
4. Refresh before expiry when the provider exposes an expiry time and supports silent renewal.
5. Retry transient renewal failures with bounded exponential backoff and jitter.
6. When human re-authentication is required, surface a clear reconnect state immediately and preserve the intended return action.
7. Do not persist browser session cookies or short-lived bearer tokens in source control, logs, analytics, or client-visible storage.

## Opera Browser Connector baseline
- When the connector is already available, EKODI-assisted browser tasks should use it by default instead of asking the user to reconnect.
- A healthy connection should not be deliberately disconnected at the end of a task.
- If the underlying Opera/ChatGPT connector session expires or is revoked, EKODI must not attempt to evade that expiry. The recovery path is a single explicit reconnect/re-authorization step, followed by automatic resumption where possible.
- Connector state should be reported as `connected`, `degraded`, `reauth_required`, or `unavailable`.

## Reusable runtime contract
A connector adapter should expose:

```js
{
  id,
  state,
  checkedAt,
  expiresAt,
  supportsSilentRefresh,
  refresh(),
  healthCheck(),
  reconnectUrl
}
```

The orchestrator should prefer `connected`, then `degraded`; it must not route new work through `reauth_required` or `unavailable` adapters.

## Security boundary
"Always connected" means continuous usability within provider-supported session rules. It does not mean disabling token expiry, storing credentials insecurely, defeating MFA, or suppressing provider revocation. Security controls remain authoritative.
