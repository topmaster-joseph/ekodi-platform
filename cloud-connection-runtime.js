const DEFAULT_PRIORITY = Object.freeze([
  'official_api',
  'connected_plugin',
  'oauth_cloud',
  'workload_identity',
  'cloud_browser',
  'remote_desktop',
  'opera_browser',
]);

const ALLOWED_STATES = new Set(['connected', 'refreshable', 'needs_user_auth', 'unavailable']);
const USER_AUTH_STEPS = Object.freeze(['login', 'consent', 'mfa', 'reauthentication']);
const QUOTA_ERROR_CODES = new Set([
  'QUOTA_EXHAUSTED',
  'MONTHLY_QUOTA_EXHAUSTED',
  'USAGE_LIMIT_REACHED',
  'RATE_LIMIT',
  'RATE_LIMITED',
  'TOO_MANY_REQUESTS',
]);

export const CLOUD_CONNECTION_POLICY = Object.freeze({
  version: '1.1.0',
  strategy: 'cloud_first_provider_independent',
  operaRequired: false,
  operaEnabledByDefault: false,
  automaticFailover: true,
  usageAwareFailover: true,
  automaticRefresh: true,
  browserSecretsAllowed: false,
  credentialStorage: 'server_only_encrypted_or_managed_secret_store',
  userAuthSteps: USER_AUTH_STEPS,
  priority: DEFAULT_PRIORITY,
  remoteDesktop: Object.freeze({
    role: 'local_only_secondary_adapter',
    preferBundledOperations: true,
    skipWhenQuotaRemainingPercentAtOrBelow: 0,
    doNotEvadeAccountQuotaWithAnotherDevice: true,
  }),
});

function disabled(value) {
  return ['0', 'false', 'off', 'disabled', 'none'].includes(String(value ?? '').trim().toLowerCase());
}

export function isOperaConnectorEnabled(env = {}) {
  const raw = env.OPERA_BROWSER_CONNECTOR_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  return !disabled(raw);
}

function normalizePercent(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace('%', '').trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function getQuotaRemainingPercent(provider) {
  return normalizePercent(provider?.quotaRemainingPercent ?? provider?.usage?.remainingPercent);
}

function classifyProviderError(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  if (QUOTA_ERROR_CODES.has(code) || error?.status === 429) {
    return code.includes('RATE') || code === 'TOO_MANY_REQUESTS' || error?.status === 429
      ? 'rate_limited'
      : 'quota_exhausted';
  }
  if (message.includes('quota') || message.includes('usage limit') || message.includes('monthly limit')) return 'quota_exhausted';
  if (message.includes('rate limit') || message.includes('too many requests')) return 'rate_limited';
  return 'provider_error';
}

function normalizeProvider(provider, index, env) {
  const kind = String(provider?.kind || '').trim();
  const state = ALLOWED_STATES.has(provider?.state) ? provider.state : 'unavailable';
  const id = String(provider?.id || `${kind || 'provider'}_${index + 1}`).trim();
  const quotaRemainingPercent = getQuotaRemainingPercent(provider);
  const quotaExhausted = provider?.quotaExhausted === true || quotaRemainingPercent !== null && quotaRemainingPercent <= 0;
  const operaDisabled = kind === 'opera_browser' && !isOperaConnectorEnabled(env);
  const explicitlyUnavailable = provider?.available === false;
  const available = !explicitlyUnavailable && !operaDisabled && !quotaExhausted;
  const unavailableReason = quotaExhausted
    ? 'quota_exhausted'
    : operaDisabled
      ? 'disabled'
      : explicitlyUnavailable
        ? provider?.unavailableReason || 'unavailable'
        : state === 'unavailable'
          ? provider?.unavailableReason || 'unavailable'
          : null;
  return {
    id,
    kind,
    state: available ? state : 'unavailable',
    invoke: provider?.invoke,
    refresh: provider?.refresh,
    userAction: provider?.userAction || null,
    available,
    quotaRemainingPercent,
    unavailableReason,
  };
}

function rank(kind, priority) {
  const index = priority.indexOf(kind);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function freezeSkipped(skippedProviders) {
  return Object.freeze(skippedProviders.map(item => Object.freeze({ ...item })));
}

export function getCloudConnectionStatus(env = {}, providers = [], priority = DEFAULT_PRIORITY) {
  const normalized = (Array.isArray(providers) ? providers : [])
    .map((provider, index) => normalizeProvider(provider, index, env))
    .sort((a, b) => rank(a.kind, priority) - rank(b.kind, priority));
  const usable = normalized.filter(provider => provider.available && ['connected', 'refreshable'].includes(provider.state));
  const authRequired = normalized.filter(provider => provider.available && provider.state === 'needs_user_auth');
  const skippedProviders = normalized
    .filter(provider => !provider.available || provider.state === 'unavailable')
    .map(provider => ({
      id: provider.id,
      kind: provider.kind,
      reason: provider.unavailableReason || 'unavailable',
      quotaRemainingPercent: provider.quotaRemainingPercent,
    }));
  return Object.freeze({
    policyVersion: CLOUD_CONNECTION_POLICY.version,
    strategy: CLOUD_CONNECTION_POLICY.strategy,
    operaRequired: false,
    operaEnabled: isOperaConnectorEnabled(env),
    usableProviders: usable.map(provider => provider.id),
    authRequiredProviders: authRequired.map(provider => provider.id),
    skippedProviders: freezeSkipped(skippedProviders),
  });
}

async function tryRefresh(provider) {
  if (provider.state !== 'refreshable') return provider;
  if (typeof provider.refresh !== 'function') return { ...provider, state: 'unavailable', unavailableReason: 'provider_error' };
  try {
    const result = await provider.refresh();
    if (result?.state === 'needs_user_auth') return { ...provider, state: 'needs_user_auth', userAction: result.userAction || provider.userAction };
    if (result === false || result?.ok === false) return { ...provider, state: 'unavailable', unavailableReason: 'provider_error' };
    return { ...provider, state: 'connected' };
  } catch (error) {
    if (error?.code === 'USER_AUTH_REQUIRED') {
      return { ...provider, state: 'needs_user_auth', userAction: error.userAction || provider.userAction };
    }
    return { ...provider, state: 'unavailable', unavailableReason: classifyProviderError(error) };
  }
}

export async function runCloudConnectedTask(options = {}) {
  const {
    env = {},
    providers = [],
    taskName = 'connected_operation',
    priority = DEFAULT_PRIORITY,
  } = options;

  const normalized = (Array.isArray(providers) ? providers : [])
    .map((provider, index) => normalizeProvider(provider, index, env))
    .sort((a, b) => rank(a.kind, priority) - rank(b.kind, priority));

  const skippedProviders = normalized
    .filter(provider => !provider.available || provider.state === 'unavailable')
    .map(provider => ({
      id: provider.id,
      kind: provider.kind,
      reason: provider.unavailableReason || 'unavailable',
      quotaRemainingPercent: provider.quotaRemainingPercent,
    }));
  const ordered = normalized.filter(provider => provider.available);
  const attemptedProviders = [];
  const authRequired = [];

  for (const original of ordered) {
    let provider = original;
    if (provider.state === 'needs_user_auth') {
      authRequired.push(provider);
      continue;
    }
    if (provider.state === 'refreshable') provider = await tryRefresh(provider);
    if (provider.state === 'needs_user_auth') {
      authRequired.push(provider);
      continue;
    }
    if (provider.state === 'unavailable') {
      skippedProviders.push({
        id: provider.id,
        kind: provider.kind,
        reason: provider.unavailableReason || 'provider_error',
        quotaRemainingPercent: provider.quotaRemainingPercent,
      });
      continue;
    }
    if (provider.state !== 'connected' || typeof provider.invoke !== 'function') continue;

    attemptedProviders.push(provider.id);
    try {
      const value = await provider.invoke();
      return Object.freeze({
        ok: true,
        taskName,
        provider: provider.id,
        kind: provider.kind,
        attemptedProviders: Object.freeze([...attemptedProviders]),
        skippedProviders: freezeSkipped(skippedProviders),
        value,
        requiresUserAction: false,
      });
    } catch (error) {
      if (error?.code === 'USER_AUTH_REQUIRED') {
        authRequired.push({ ...provider, state: 'needs_user_auth', userAction: error.userAction || provider.userAction });
      } else {
        skippedProviders.push({
          id: provider.id,
          kind: provider.kind,
          reason: classifyProviderError(error),
          quotaRemainingPercent: provider.quotaRemainingPercent,
        });
      }
    }
  }

  const firstAuth = authRequired[0];
  if (firstAuth) {
    return Object.freeze({
      ok: false,
      taskName,
      provider: firstAuth.id,
      kind: firstAuth.kind,
      attemptedProviders: Object.freeze([...attemptedProviders]),
      skippedProviders: freezeSkipped(skippedProviders),
      requiresUserAction: true,
      userAction: firstAuth.userAction || Object.freeze({ type: 'reauthentication', instruction: 'Reconnect the provider using its normal login and consent flow.' }),
      reason: 'authorized_alternatives_exhausted',
    });
  }

  return Object.freeze({
    ok: false,
    taskName,
    provider: null,
    kind: null,
    attemptedProviders: Object.freeze([...attemptedProviders]),
    skippedProviders: freezeSkipped(skippedProviders),
    requiresUserAction: false,
    reason: 'no_authorized_provider_available',
  });
}
