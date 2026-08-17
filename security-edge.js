const MAX_MUTATION_BODY_BYTES = 2 * 1024 * 1024;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_METHODS = new Set(['TRACE', 'CONNECT']);
const encoder = new TextEncoder();

const PUBLIC_AUTH_PATHS = new Set([
  '/api/google/challenge',
  '/api/google/login',
  '/api/customer/federated-login',
  '/api/device-agent/enroll',
]);

async function fingerprint(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || 'unknown')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function requestIdentity(request) {
  const authorization = request.headers.get('authorization') || '';
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim();
    if (token.length >= 16) return `session:${await fingerprint(token)}`;
  }
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return `network:${await fingerprint(ip)}`;
}

function isSensitiveMutation(path, method) {
  if (!MUTATION_METHODS.has(method)) return false;
  return path.startsWith('/api/control/')
    || path.startsWith('/api/admin-access/')
    || path.startsWith('/api/domains')
    || path.startsWith('/api/registry')
    || path.startsWith('/api/books/admin/')
    || path.startsWith('/api/community/admin/')
    || path.startsWith('/api/membership/')
    || path.startsWith('/api/marketing/ledger/');
}

function tooLarge(request) {
  if (!MUTATION_METHODS.has(request.method)) return false;
  const raw = request.headers.get('content-length');
  if (!raw) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_MUTATION_BODY_BYTES;
}

async function enforceLimiter(binding, key) {
  if (!binding?.limit || !key) return { available: false, allowed: false };
  try {
    const result = await binding.limit({ key });
    return { available: true, allowed: result?.success !== false };
  } catch (error) {
    console.error('Security rate limiter unavailable', error);
    return { available: false, allowed: false };
  }
}

function jsonError(error, code, status, extraHeaders = {}) {
  return applyApiSecurityHeaders(new Response(JSON.stringify({ error, code }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  }));
}

function limiterUnavailable(path, request) {
  console.error('Security rate limiter protection unavailable', { path, ray: request.headers.get('cf-ray') || '' });
  return jsonError('보안 보호장치가 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'SECURITY_RATE_LIMITER_UNAVAILABLE', 503, { 'retry-after': '30' });
}

export async function enforceEdgeSecurity(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (BLOCKED_METHODS.has(request.method)) {
    return jsonError('허용되지 않은 HTTP 메서드입니다.', 'METHOD_BLOCKED', 405, { allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS' });
  }

  if (tooLarge(request)) {
    return jsonError('요청 본문이 허용 크기를 초과했습니다.', 'REQUEST_BODY_TOO_LARGE', 413);
  }

  if (PUBLIC_AUTH_PATHS.has(path) && request.method === 'POST') {
    const key = `${path}:${await requestIdentity(request)}`;
    const result = await enforceLimiter(env.AUTH_RATE_LIMITER, key);
    if (!result.available) return limiterUnavailable(path, request);
    if (!result.allowed) {
      console.warn('Security auth rate limit exceeded', { path, ray: request.headers.get('cf-ray') || '' });
      return jsonError('인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'AUTH_RATE_LIMITED', 429, { 'retry-after': '60' });
    }
  }

  if (isSensitiveMutation(path, request.method)) {
    const key = `${request.method}:${path.split('/').slice(0, 5).join('/')}:${await requestIdentity(request)}`;
    const result = await enforceLimiter(env.SENSITIVE_RATE_LIMITER, key);
    if (!result.available) return limiterUnavailable(path, request);
    if (!result.allowed) {
      console.warn('Security sensitive mutation rate limit exceeded', { path, ray: request.headers.get('cf-ray') || '' });
      return jsonError('민감한 작업 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'SENSITIVE_ACTION_RATE_LIMITED', 429, { 'retry-after': '60' });
    }
  }

  return null;
}

export function applyApiSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  secured.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  secured.headers.set('Referrer-Policy', 'no-referrer');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('X-Frame-Options', 'DENY');
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (!secured.headers.has('cache-control')) secured.headers.set('Cache-Control', 'no-store');
  return secured;
}

export const SECURITY_EDGE_CONSTANTS = Object.freeze({
  MAX_MUTATION_BODY_BYTES,
  PUBLIC_AUTH_PATHS: [...PUBLIC_AUTH_PATHS],
});
