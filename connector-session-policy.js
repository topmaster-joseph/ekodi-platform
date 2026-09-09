export const CONNECTOR_STATES = Object.freeze({
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  REAUTH_REQUIRED: 'reauth_required',
  UNAVAILABLE: 'unavailable',
});

export const DEFAULT_CONNECTOR_POLICY = Object.freeze({
  preferPersistentConnection: true,
  refreshLeadTimeMs: 5 * 60 * 1000,
  maxRefreshAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 30 * 1000,
  preserveIntentAcrossReauth: true,
  allowExpiryBypass: false,
  storeShortLivedBrowserCredentials: false,
});

export function normalizeConnectorState(value) {
  const state = String(value || '').trim().toLowerCase();
  return Object.values(CONNECTOR_STATES).includes(state)
    ? state
    : CONNECTOR_STATES.UNAVAILABLE;
}

export function isConnectorUsable(connector = {}) {
  const state = normalizeConnectorState(connector.state);
  return state === CONNECTOR_STATES.CONNECTED || state === CONNECTOR_STATES.DEGRADED;
}

export function shouldRefreshConnector(connector = {}, now = Date.now(), policy = DEFAULT_CONNECTOR_POLICY) {
  if (!connector.supportsSilentRefresh) return false;
  const expiresAt = connector.expiresAt ? new Date(connector.expiresAt).getTime() : Number.NaN;
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - now <= policy.refreshLeadTimeMs;
}

export function nextRetryDelay(attempt, policy = DEFAULT_CONNECTOR_POLICY) {
  const safeAttempt = Math.max(0, Number(attempt) || 0);
  return Math.min(policy.maxBackoffMs, policy.baseBackoffMs * (2 ** safeAttempt));
}

export function connectorPriority(connector = {}) {
  const state = normalizeConnectorState(connector.state);
  if (state === CONNECTOR_STATES.CONNECTED) return 100;
  if (state === CONNECTOR_STATES.DEGRADED) return 50;
  return 0;
}

export function chooseConnector(connectors = []) {
  return [...connectors]
    .filter(isConnectorUsable)
    .sort((a, b) => connectorPriority(b) - connectorPriority(a))[0] || null;
}

export function operaBrowserConnectorPolicy(overrides = {}) {
  return {
    id: 'opera-browser-connector',
    ...DEFAULT_CONNECTOR_POLICY,
    disconnectAfterTask: false,
    requireExplicitReauthWhenProviderDemandsIt: true,
    ...overrides,
  };
}
