export const EKODI_REQUIRED_CAPABILITY_HEADER = 'x-ekodi-required-capability';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READS = new Set(['GET', 'HEAD']);

function byMethod(method, readCapability, writeCapability) {
  const normalized = String(method || 'GET').toUpperCase();
  if (normalized === 'OPTIONS') return '';
  if (MUTATIONS.has(normalized)) return writeCapability;
  if (READS.has(normalized)) return readCapability;
  return writeCapability;
}

export function requiredAdminCapability(pathname = '', method = 'GET') {
  const path = String(pathname || '');
  if (path.startsWith('/api/control/secrets')) {
    return byMethod(method, 'secrets:read', 'secrets:write');
  }
  if (path.startsWith('/api/control/ai/') || path.startsWith('/api/control/user-ai')) {
    return byMethod(method, 'ai:read', 'ai:operate');
  }
  if (path.startsWith('/api/control/devotional')) {
    return byMethod(method, 'automation:read', 'automation:operate');
  }
  if (path.startsWith('/api/control/system-health') || path === '/api/control/traffic-intelligence' || path === '/api/control/api-cost') {
    return byMethod(method, 'observe:read', 'service:operate');
  }
  if (path.startsWith('/api/control/') || path.startsWith('/api/marketing/admin/')) {
    return byMethod(method, 'service:read', 'service:operate');
  }
  return '';
}
export function withAdminRouteCapability(request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  const incoming = headers.get(EKODI_REQUIRED_CAPABILITY_HEADER) || '';
  headers.delete(EKODI_REQUIRED_CAPABILITY_HEADER);

  if (url.pathname === '/api/session') {
    if (incoming) headers.set(EKODI_REQUIRED_CAPABILITY_HEADER, incoming);
  } else {
    const capability = requiredAdminCapability(url.pathname, request.method);
    if (capability) headers.set(EKODI_REQUIRED_CAPABILITY_HEADER, capability);
  }

  return new Request(request, { headers });
}
