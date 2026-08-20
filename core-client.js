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
