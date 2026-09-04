const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export class DataPlaneBoundaryError extends Error {
  constructor(message, code = 'data_plane_boundary_violation') {
    super(message);
    this.name = 'DataPlaneBoundaryError';
    this.code = code;
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId, adapterKind) {
    super(`Provider ${providerId} is not configured for ${adapterKind}`);
    this.name = 'ProviderNotConfiguredError';
    this.code = 'provider_not_configured';
    this.providerId = providerId;
    this.adapterKind = adapterKind;
  }
}

export function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== 'string' || !WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new DataPlaneBoundaryError('A valid immutable workspace_id is required', 'invalid_workspace_id');
  }
  return workspaceId;
}

export function workspaceScopedKey(workspaceId, namespace, key) {
  const id = assertWorkspaceId(workspaceId);
  for (const [label, value] of [['namespace', namespace], ['key', key]]) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\u0000')) {
      throw new DataPlaneBoundaryError(`Invalid ${label}`, `invalid_${label}`);
    }
  }
  return `workspace:${encodeURIComponent(id)}:${encodeURIComponent(namespace)}:${encodeURIComponent(key)}`;
}

function assertAdapterContract(kind, adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError(`Adapter for ${kind} must be an object`);
  }
  const required = {
    database: ['read', 'write'],
    file: ['get', 'put', 'delete'],
    cache: ['get', 'set', 'delete'],
  }[kind];
  if (!required) throw new TypeError(`Unknown adapter kind: ${kind}`);
  for (const method of required) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError(`${kind} adapter must implement ${method}()`);
    }
  }
  return adapter;
}

export class ProviderRegistry {
  #providers = new Map();

  register({ id, kind, adapter }) {
    if (!id || typeof id !== 'string') throw new TypeError('Provider id is required');
    assertAdapterContract(kind, adapter);
    const key = `${kind}:${id}`;
    if (this.#providers.has(key)) throw new TypeError(`Provider already registered: ${key}`);
    this.#providers.set(key, Object.freeze({ id, kind, adapter }));
    return this;
  }

  has(kind, id) {
    return this.#providers.has(`${kind}:${id}`);
  }

  resolve(kind, id) {
    const entry = this.#providers.get(`${kind}:${id}`);
    if (!entry) throw new ProviderNotConfiguredError(id, kind);
    return entry.adapter;
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

export function validateDataPlanePolicy(policy) {
  requireObject(policy, 'policy');
  requireObject(policy.principles, 'policy.principles');
  requireObject(policy.accountProfiles, 'policy.accountProfiles');
  requireObject(policy.dataClasses, 'policy.dataClasses');
  requireObject(policy.providers, 'policy.providers');
  requireObject(policy.trafficProtection, 'policy.trafficProtection');

  if (Number(policy.version) < 2) throw new DataPlaneBoundaryError('Data-plane policy version 2 or newer is required');
  if (policy.principles.portableCloudFirst !== true) throw new DataPlaneBoundaryError('Portable Cloud First must be enabled');
  if (policy.principles.providerSpecificCanonicalIdsForbidden !== true) throw new DataPlaneBoundaryError('Provider-specific canonical IDs must be forbidden');
  if (policy.principles.providerNativeCriticalCallsRequireAdapter !== true) throw new DataPlaneBoundaryError('Critical provider-native calls must use adapters');

  if (policy.principles.workspaceIdentityField !== 'workspace_id') {
    throw new DataPlaneBoundaryError('workspace_id must remain the canonical workspace identity');
  }
  if (policy.principles.crossWorkspaceFallback !== false) {
    throw new DataPlaneBoundaryError('Cross-workspace fallback must be disabled');
  }
  if (policy.principles.unknownProviderAction !== 'deny') {
    throw new DataPlaneBoundaryError('Unknown providers must fail closed');
  }
  if (Number(policy.trafficProtection.databaseBypassTargetPercent) < 95) {
    throw new DataPlaneBoundaryError('Database bypass target must be at least 95%');
  }
  if (policy.trafficProtection.publicRequestMayReachCoreDatabase !== false) {
    throw new DataPlaneBoundaryError('Public delivery requests must not reach the core database');
  }

  for (const [providerId, provider] of Object.entries(policy.providers)) {
    const portability = provider.portability;
    if (!portability || !['standard-native', 'adapter-portable', 'export-portable', 'provider-bound'].includes(portability.class)) throw new DataPlaneBoundaryError(`Provider ${providerId} must declare a valid portability class`);
    if (!portability.runtimeContract || !portability.dataExit) throw new DataPlaneBoundaryError(`Provider ${providerId} must declare runtimeContract and dataExit`);
  }
  for (const [dataClass, rule] of Object.entries(policy.dataClasses)) {
    const provider = policy.providers[rule.defaultProvider];
    if (!provider) throw new DataPlaneBoundaryError(`Unknown default provider for ${dataClass}`);
    if (provider.adapterKind !== rule.adapterKind) throw new DataPlaneBoundaryError(`Adapter kind mismatch for ${dataClass}`);
    if (rule.canonicalData === true && provider.portability?.canonicalDataAllowed !== true) throw new DataPlaneBoundaryError(`Canonical data class ${dataClass} cannot use provider ${rule.defaultProvider}`);
    if (rule.canonicalData === true && provider.portability?.class === 'provider-bound') throw new DataPlaneBoundaryError(`Canonical data class ${dataClass} cannot default to provider-bound infrastructure`);
  }
  return true;
}

export function createDataPlane({ policy, registry = new ProviderRegistry(), workspaceOverrides = {} }) {
  validateDataPlanePolicy(policy);
  const frozenOverrides = Object.freeze({ ...workspaceOverrides });

  function route({ accountProfile, dataClass, workspaceId = null }) {
    const account = policy.accountProfiles[accountProfile];
    if (!account) throw new DataPlaneBoundaryError(`Unknown account profile: ${accountProfile}`, 'unknown_account_profile');
    if (!Array.isArray(account.allowedDataClasses) || !account.allowedDataClasses.includes(dataClass)) {
      throw new DataPlaneBoundaryError(`${accountProfile} may not access ${dataClass}`, 'account_data_class_denied');
    }

    const rule = policy.dataClasses[dataClass];
    if (!rule) throw new DataPlaneBoundaryError(`Unknown data class: ${dataClass}`, 'unknown_data_class');
    if (rule.scope === 'workspace') assertWorkspaceId(workspaceId);

    if (accountProfile === 'production-public' && rule.adapterKind === 'database') {
      throw new DataPlaneBoundaryError('Production public plane may not reach a database', 'public_database_denied');
    }

    const override = workspaceId ? frozenOverrides[workspaceId]?.[dataClass] : null;
    const providerId = override || rule.defaultProvider;
    const providerPolicy = policy.providers[providerId];
    if (!providerPolicy || providerPolicy.adapterKind !== rule.adapterKind) {
      throw new DataPlaneBoundaryError(`Invalid provider route: ${providerId}`, 'invalid_provider_route');
    }

    const adapter = registry.resolve(rule.adapterKind, providerId);
    return Object.freeze({
      accountProfile,
      dataClass,
      workspaceId: rule.scope === 'workspace' ? workspaceId : null,
      scope: rule.scope,
      adapterKind: rule.adapterKind,
      providerId,
      providerPortability: Object.freeze({ ...providerPolicy.portability }),
      adapter,
    });
  }

  return Object.freeze({ route, registry });
}

export async function readThroughWorkspaceCache({
  workspaceId,
  namespace,
  key,
  cache,
  loader,
  ttlSeconds = 300,
}) {
  assertAdapterContract('cache', cache);
  if (typeof loader !== 'function') throw new TypeError('loader must be a function');
  const scopedKey = workspaceScopedKey(workspaceId, namespace, key);
  const cached = await cache.get(scopedKey);
  if (cached !== null && cached !== undefined) return { value: cached, source: 'cache', key: scopedKey };
  const value = await loader();
  await cache.set(scopedKey, value, { ttlSeconds });
  return { value, source: 'origin', key: scopedKey };
}
