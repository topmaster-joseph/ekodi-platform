// EKODI-EDGE-TRAFFIC-SHIELD-001
//
// Two gaps in the concurrent-traffic policy (EKODI-CONCURRENT-TRAFFIC-10K-001):
//
// 1. Client isolation. The Shared Site governor measures pressure on one site-wide
//    key. A single client that floods GET requests therefore raises the tier for
//    everyone (L3/PROTECT sheds crawlers and noncritical paths for all users) —
//    one abuser degrades the whole platform. The client budget below rejects that
//    client alone, before it spends the site-wide budget.
//
// 2. Satellite coverage. The policy says it applies recursively to all services,
//    but apex-path Workers (ekodi.kr/qtin*, /ekodipay*, /ekodibiz/pay*, /delivery*,
//    /support*, /sosik*, /local-commerce*, /ekodichurch/history*, seonammedi.kr)
//    are matched by more specific Cloudflare routes and never pass through the
//    Shared Site guard. They had no method/size checks and no write rate limit.
//
// Reads fail open: a missing or failing limiter binding never blocks a page view.
// Writes reuse enforcePlatformRequestSecurity (the same rules as the Shared Site);
// on satellites without limiter bindings they degrade to method/size checks only,
// so a payment callback is never turned into a 503 by a configuration gap.

import { enforcePlatformRequestSecurity } from './platform-security-policy.js';

export const EDGE_TRAFFIC_SHIELD_POLICY = 'EKODI-EDGE-TRAFFIC-SHIELD-001';
export const CLIENT_BINDINGS = Object.freeze({
  client: 'TRAFFIC_CLIENT_RATE_LIMITER',   // per signed-in session or per IP+UA
  network: 'TRAFFIC_NETWORK_RATE_LIMITER', // per IP ceiling (defeats UA/cookie rotation)
});
const EXEMPT_PATHS = new Set(['/health', '/__ekodi/version', '/robots.txt', '/sitemap.xml', '/llms.txt', '/favicon.ico']);
const encoder = new TextEncoder();

async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return [...new Uint8Array(hash)].slice(0, 16).map(v => v.toString(16).padStart(2, '0')).join('');
}

function clientIp(request) {
  // Only Cloudflare's own header. Requests that arrive through a service binding
  // have no eyeball IP; bucketing them under one shared "unknown" key would let
  // internal fan-out throttle itself, so they are not budgeted here.
  return String(request.headers.get('cf-connecting-ip') || '').trim();
}

async function clientIdentity(request, ip) {
  const authorization = String(request.headers.get('authorization') || '');
  if (authorization.startsWith('Bearer ') && authorization.length > 23) return 'session:' + await digest(authorization.slice(7));
  const cookie = String(request.headers.get('cookie') || '');
  if (cookie.length >= 16) return 'cookie:' + await digest(cookie);
  return 'anon:' + await digest(ip + '|' + String(request.headers.get('user-agent') || '').slice(0, 160));
}

async function allowed(binding, key) {
  if (!binding?.limit) return null;
  try {
    const result = await binding.limit({ key });
    return result?.success !== false;
  } catch (error) {
    console.error('EKODI edge traffic shield limiter unavailable', String(error?.message || error));
    return null;
  }
}

function wantsHtml(request) {
  return String(request.headers.get('accept') || '').toLowerCase().includes('text/html');
}

export function clientThrottleResponse(request, scope, service = 'shared-site') {
  const headers = {
    'cache-control': 'no-store',
    'retry-after': '10',
    'x-content-type-options': 'nosniff',
    'x-ekodi-traffic-shield': scope,
    'x-ekodi-traffic-policy': EDGE_TRAFFIC_SHIELD_POLICY,
    'x-ekodi-service': service,
  };
  if (wantsHtml(request)) {
    return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>잠시 후 다시 시도해 주세요</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.7;color:#1f2937"><h1 style="font-size:1.3rem">요청이 잠시 많습니다</h1><p>짧은 시간에 너무 많은 요청이 들어와 10초 동안 잠시 쉬어 갑니다. 잠시 뒤 새로고침해 주세요.</p><p style="color:#6b7280;font-size:.85rem">EKODI · ' + scope + '</p></body></html>',
      { status: 429, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(JSON.stringify({ ok: false, error: 'TRAFFIC_CLIENT_THROTTLED', scope, retryAfter: 10 }),
    { status: 429, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}

/**
 * Per-client read budget. Returns a 429 Response for a flooding client, otherwise null.
 * Mutations are left to enforcePlatformRequestSecurity (stricter, identity-scoped).
 */
export async function enforceClientTrafficBudget(request, env = {}, { service = 'shared-site' } = {}) {
  const method = String(request.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return null;
  const path = new URL(request.url).pathname;
  if (EXEMPT_PATHS.has(path)) return null;
  const ip = clientIp(request);
  if (!ip) return null;
  const identity = await clientIdentity(request, ip);
  const [client, network] = await Promise.all([
    allowed(env[CLIENT_BINDINGS.client], 'read:' + identity),
    allowed(env[CLIENT_BINDINGS.network], 'net:' + await digest(ip)),
  ]);
  const scope = client === false ? 'client' : network === false ? 'network' : '';
  if (!scope) return null;
  console.warn('EKODI client traffic throttled', JSON.stringify({ service, scope, path, ray: request.headers.get('cf-ray') || '' }));
  return clientThrottleResponse(request, scope, service);
}

function hasWriteLimiters(env) {
  return Boolean(env?.PLATFORM_PUBLIC_WRITE_RATE_LIMITER?.limit && env?.PLATFORM_SENSITIVE_RATE_LIMITER?.limit);
}

function withBaselineHeaders(response, service) {
  let out;
  try { out = new Response(response.body, response); } catch { return response; }
  const headers = out.headers;
  if (!headers.has('strict-transport-security')) headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff');
  headers.set('x-ekodi-traffic-shield', 'on');
  headers.set('x-ekodi-traffic-policy', EDGE_TRAFFIC_SHIELD_POLICY);
  if (!headers.has('x-ekodi-service')) headers.set('x-ekodi-service', service);
  return out;
}

/** Wrap a satellite Worker entry ({fetch, scheduled, queue, ...}) with the edge traffic shield. */
export function withEdgeTrafficShield(worker, { service = 'satellite' } = {}) {
  if (!worker || typeof worker.fetch !== 'function') return worker;
  if (worker.__ekodiEdgeTrafficShield) return worker;
  const wrapped = Object.assign(Object.create(Object.getPrototypeOf(worker)), worker);
  wrapped.fetch = async function fetchWithEdgeTrafficShield(request, env = {}, ctx) {
    const throttled = await enforceClientTrafficBudget(request, env, { service });
    if (throttled) return throttled;
    // Same request rules as the Shared Site. Without limiter bindings the write
    // limiter would fail closed (503) in production; satellites degrade to
    // method/query/body checks instead, which never block a legitimate callback.
    const securityEnv = hasWriteLimiters(env) ? env : { ...env, ENVIRONMENT: 'shield-unbound' };
    const guard = await enforcePlatformRequestSecurity(request, securityEnv);
    if (guard) return withBaselineHeaders(guard, service);
    const response = await worker.fetch.call(worker, request, env, ctx);
    return withBaselineHeaders(response, service);
  };
  Object.defineProperty(wrapped, '__ekodiEdgeTrafficShield', { value: true });
  return wrapped;
}
