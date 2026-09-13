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

export const CLOUD_CONNECTION_POLICY = Object.freeze({
  version: '1.0.0',
  strategy: 'cloud_first_provider_independent',
  operaRequired: false,
  operaEnabledByDefault: false,
  automaticFailover: true,
  automaticRefresh: true,
  browserSecretsAllowed: false,
  credentialStorage: 'server_only_encrypted_or_managed_secret_store',
  userAuthSteps: USER_AUTH_STEPS,
  priority: DEFAULT_PRIORITY,
});

function disabled(value) {
  return ['0', 'false', 'off', 'disabled', 'none'].includes(String(value ?? '').trim().toLowerCase());
}

export function isOperaConnectorEnabled(env = {}) {
  const raw = env.OPERA_BROWSER_CONNECTOR_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  return !disabled(raw);
}

function normalizeProvider(provider, index, env) {
  const kind = String(provider?.kind || '').trim();
  const state = ALLOWED_STATES.has(provider?.state) ? provider.state : 'unavailable';
  const id = String(provider?.id || `${kind || 'provider'}_${index + 1}`).trim();
  const available = provider?.available !== false && !(kind === 'opera_browser' && !isOperaConnectorEnabled(env));
  return {
    id,
    kind,
    state: available ? state : 'unavailable',
    invoke: provider?.invoke,
    refresh: provider?.refresh,
    userAction: provider?.userAction || null,
    available,
  };
}

function rank(kind, priority) {
  const index = priority.indexOf(kind);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function getCloudConnectionStatus(env = {}, providers = [], priority = DEFAULT_PRIORITY) {
  const normalized = (Array.isArray(providers) ? providers : [])
    .map((provider, index) => normalizeProvider(provider, index, env))
    .sort((a, b) => rank(a.kind, priority) - rank(b.kind, priority));
  const usable = normalized.filter(provider => provider.available && ['connected', 'refreshable'].includes(provider.state));
  const authRequired = normalized.filter(provider => provider.available && provider.state === 'needs_user_auth');
  return Object.freeze({
    policyVersion: CLOUD_CONNECTION_POLICY.version,
    strategy: CLOUD_CONNECTION_POLICY.strategy,
    operaRequired: false,
    operaEnabled: isOperaConnectorEnabled(env),
    usableProviders: usable.map(provider => provider.id),
    authRequiredProviders: authRequired.map(provider => provider.id),
  });
}

async function tryRefresh(provider) {
  if (provider.state !== 'refreshable') return provider;
  if (typeof provider.refresh !== 'function') return { ...provider, state: 'unavailable' };
  try {
    const result = await provider.refresh();
    if (result?.state === 'needs_user_auth') return { ...provider, state: 'needs_user_auth', userAction: result.userAction || provider.userAction };
    if (result === false || result?.ok === false) return { ...provider, state: 'unavailable' };
    return { ...provider, state: 'connected' };
  } catch (error) {
    if (error?.code === 'USER_AUTH_REQUIRED') {
      return { ...provider, state: 'needs_user_auth', userAction: error.userAction || provider.userAction };
    }
    return { ...provider, state: 'unavailable' };
  }
}

export async function runCloudConnectedTask(options = {}) {
  const {
    env = {},
    providers = [],
    taskName = 'connected_operation',
    priority = DEFAULT_PRIORITY,
  } = options;

  const ordered = (Array.isArray(providers) ? providers : [])
    .map((provider, index) => normalizeProvider(provider, index, env))
    .filter(provider => provider.available)
    .sort((a, b) => rank(a.kind, priority) - rank(b.kind, priority));

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
        value,
        requiresUserAction: false,
      });
    } catch (error) {
      if (error?.code === 'USER_AUTH_REQUIRED') {
        authRequired.push({ ...provider, state: 'needs_user_auth', userAction: error.userAction || provider.userAction });
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
    requiresUserAction: false,
    reason: 'no_authorized_provider_available',
  });
}
