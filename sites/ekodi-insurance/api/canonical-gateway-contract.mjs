// INERT contract for a future canonical EKODI insurance API gateway.
// Deliberately no network, secrets, D1 access, auth forwarding, or live routing.
// Issue #6569: implementation requires independently authorized Orchestrator gate.
const APEX_ORIGIN = 'https://ekodi.kr';
const PREFIX = '/api/insurance';

const FIXED = Object.freeze({
  'GET /health': Object.freeze({ upstreamPath: '/health', operation: 'health', bodyMaxBytes: 0 }),
  'GET /network/catalog': Object.freeze({ upstreamPath: '/api/network/catalog', operation: 'catalog', bodyMaxBytes: 0 }),
  'POST /chat': Object.freeze({ upstreamPath: '/api/chat', operation: 'chat', bodyMaxBytes: 65536 }),
  'POST /consultations': Object.freeze({ upstreamPath: '/api/consultations', operation: 'consultation-create', bodyMaxBytes: 131072 })
});
const REVOKE_PATH = /^\/consultations\/(con_[a-f0-9-]{1,90})\/revoke$/i;
const FORWARDED_HEADERS = Object.freeze(['accept', 'content-type']);

function deny(status, code) {
  return Object.freeze({ allowed: false, status, code });
}

export function classifyInsuranceGatewayRequest(request) {
  if (!request || typeof request.url !== 'string' || !request.headers?.get) {
    return deny(400, 'invalid_request');
  }
  let url;
  try { url = new URL(request.url); }
  catch { return deny(400, 'invalid_url'); }

  if (url.origin !== APEX_ORIGIN || url.username || url.password || url.port) {
    return deny(421, 'canonical_origin_required');
  }
  // Never forward search/query strings or fragments, which could contain PII,
  // access tokens, or cross-host redirect/authorization hints.
  if (url.search || url.hash) return deny(400, 'query_not_permitted');
  if (!url.pathname.startsWith(PREFIX + '/')) return deny(404, 'not_insurance_api');
  const suffix = url.pathname.slice(PREFIX.length);
  // Lowercase exact public routes; reject percent encoding, duplicate slashes,
  // dot segments, uppercase alias paths, unrecognized or internal endpoints.
  if (!/^\/[a-z0-9/_-]+$/.test(suffix) || suffix.includes('//') ||
      suffix.endsWith('/') || suffix.includes('/./') || suffix.includes('/../')) {
    return deny(404, 'unknown_api_route');
  }
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return deny(405, 'preflight_not_delegated');
  if (!['GET', 'POST'].includes(method)) return deny(405, 'method_not_permitted');

  let rule = FIXED[method + ' ' + suffix];
  if (!rule && method === 'POST') {
    const m = REVOKE_PATH.exec(suffix);
    if (m) rule = Object.freeze({
      upstreamPath: '/api/consultations/' + m[1] + '/revoke',
      operation: 'consultation-revoke',
      bodyMaxBytes: 2048
    });
  }
  if (!rule) return deny(404, 'unknown_api_route');

  const mutating = method === 'POST';
  if (mutating) {
    // A browser's apex session cookies are NOT upstream authorization. Mutating
    // consumer endpoints require an apex Origin and optional fetch-site proof.
    if (request.headers.get('origin') !== APEX_ORIGIN) return deny(403, 'origin_required');
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin') return deny(403, 'cross_site_forbidden');
    const type = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return deny(415, 'json_required');
    const length = request.headers.get('content-length');
    if (length !== null) {
      if (!/^(0|[1-9]\d{0,8})$/.test(length) || Number(length) > rule.bodyMaxBytes) {
        return deny(413, 'request_body_too_large');
      }
    }
  }

  return Object.freeze({
    allowed: true,
    method,
    upstreamPath: rule.upstreamPath,
    operation: rule.operation,
    maxBodyBytes: rule.bodyMaxBytes,
    requiresActualStreamSizeCheck: mutating,
    noStore: true,
    usePrivateServiceBindingOnly: true,
    forwardedHeaders: FORWARDED_HEADERS
  });
}
