const DEFAULT_CORE_ORIGIN = 'https://api.ekodi.kr';
const CORE_PREFIX = '/api/core/v1';

function coreOrigin(env = {}) {
  const value = String(env.CORE_API_ORIGIN || DEFAULT_CORE_ORIGIN).trim();
  return value.replace(/\/+$/, '');
}

function forwardedHeaders(request, extra = {}) {
  const headers = new Headers(extra);
  const authorization = request?.headers?.get?.('authorization');
  if (authorization) headers.set('authorization', authorization);
  headers.set('accept', 'application/json');
  return headers;
}

async function coreRequest(request, env, path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, Math.min(5000, Number(options.timeoutMs) || 2500));
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetch(`${coreOrigin(env)}${CORE_PREFIX}${path}`, {
      method: 'GET',
      headers: forwardedHeaders(request, options.headers),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(body?.error || `EKODI Core API request failed (${response.status})`);
      error.code = body?.code || 'CORE_API_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function getCoreStatus(request, env) {
  return coreRequest(request, env, '/status');
}

export function getCoreContracts(request, env) {
  return coreRequest(request, env, '/contracts');
}

export function getCoreMe(request, env) {
  return coreRequest(request, env, '/me');
}

export function listCoreOrganizations(request, env) {
  return coreRequest(request, env, '/organizations');
}

export function getCoreOrganization(request, env, slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) {
    const error = new Error('Invalid EKODI Core organization slug');
    error.code = 'CORE_ORGANIZATION_SLUG_INVALID';
    throw error;
  }
  return coreRequest(request, env, `/organizations/${encodeURIComponent(normalized)}`);
}

export function getCorePermission(request, env, { serviceId, action = 'read', capability = '', scope = 'service', reversible = true } = {}) {
  const service = String(serviceId || '').trim().toLowerCase();
  const normalizedAction = String(action || 'read').trim().toLowerCase();
  const normalizedCapability = String(capability || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(service)) {
    const error = new Error('Invalid EKODI Core service id');
    error.code = 'CORE_SERVICE_ID_INVALID';
    throw error;
  }
  if (!/^[a-z0-9._-]{1,80}$/.test(normalizedAction)) {
    const error = new Error('Invalid EKODI Core action');
    error.code = 'CORE_ACTION_INVALID';
    throw error;
  }
  if (normalizedCapability && !/^[a-z0-9._-]{1,120}$/.test(normalizedCapability)) {
    const error = new Error('Invalid EKODI Core capability');
    error.code = 'CORE_CAPABILITY_INVALID';
    throw error;
  }
  const params = new URLSearchParams({
    service,
    action: normalizedAction,
    scope: scope === 'tenant' ? 'tenant' : 'service',
    reversible: reversible === false ? 'false' : 'true',
  });
  if (normalizedCapability) params.set('capability', normalizedCapability);
  return coreRequest(request, env, `/permission?${params.toString()}`);
}
