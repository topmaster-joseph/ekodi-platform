import { resolveO2OTarget } from './o2o-link-core.js';

// O2O codes are 192-bit opaque navigation links, never attendance or identity proofs.
// Only in-flight lookups may be shared. Do NOT cache any resolved/failed result:
// stopping a QR must take effect on the next request without an edge TTL.
const CAMPAIGN_ROUTE = /^\/o2o\/go\/([0-9a-f]{48})$/;
const PREFIX = '/o2o/go/';
const MAX_IN_FLIGHT = 96;
const flightsByFetcher = new WeakMap();

function statusResponse(status, method = 'GET', duration = null) {
  const message = status === 503 ? '일시적으로 사용할 수 없습니다.' :
    status === 405 ? 'Method Not Allowed' : '찾을 수 없는 QR 링크입니다.';
  return new Response(method === 'HEAD' ? null : message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'x-ekodi-route': 'o2o-issued-link',
      ...(status === 405 ? { allow: 'GET, HEAD' } : {}),
      ...(duration === null ? {} : { 'server-timing': 'o2o-resolve;dur=' + duration })
    }
  });
}

export function isO2OIssuedLinkPath(pathname) {
  return String(pathname || '').startsWith(PREFIX);
}

async function lookupOnce(token, base, apiKey, fetcher) {
  try {
    const response = await fetcher(base + '/rest/v1/rpc/o2o_public_resolve', {
      method: 'POST',
      headers: { apikey: apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ p_token: token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
      redirect: 'manual'
    });
    if (!response.ok) return { status: response.status >= 500 ? 503 : 404 };
    const result = await response.json();
    if (result?.ok !== true) return { status: 404 };
    try {
      // Validate even a database-supplied path; it can never be an open redirect.
      const resolved = resolveO2OTarget({
        siteId: String(result.site_id || ''),
        targetPath: String(result.target_path || '')
      });
      if (!resolved.url.startsWith('https://ekodi.kr/')) return { status: 404 };
      return { status: 302, destination: resolved.url };
    } catch {
      return { status: 404 };
    }
  } catch {
    return { status: 503 };
  }
}

function resolveInFlight(token, base, apiKey, fetcher) {
  let flights = flightsByFetcher.get(fetcher);
  if (!flights) {
    flights = new Map();
    flightsByFetcher.set(fetcher, flights);
  }
  // Keep the full connection identity scoped to this in-memory lookup.
  // No cache entry exists once the upstream request has settled.
  const key = base + '\n' + apiKey + '\n' + token;
  const previous = flights.get(key);
  if (previous) return previous;
  const operation = lookupOnce(token, base, apiKey, fetcher);
  if (flights.size < MAX_IN_FLIGHT) {
    flights.set(key, operation);
    const clear = () => {
      if (flights.get(key) === operation) flights.delete(key);
    };
    operation.then(clear, clear);
  }
  return operation;
}

export async function o2oIssuedLinkResponse(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (!isO2OIssuedLinkPath(url.pathname)) return null;
  const method = request.method;
  if (!['GET', 'HEAD'].includes(method)) return statusResponse(405, method);
  const matched = CAMPAIGN_ROUTE.exec(url.pathname);
  if (!matched || url.search || url.hash) return statusResponse(404, method);
  const base = String(env?.SUPABASE_URL || '');
  const apiKey = String(env?.SUPABASE_PUBLISHABLE_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !apiKey) {
    return statusResponse(503, method);
  }

  const start = Date.now();
  const result = await resolveInFlight(matched[1], base, apiKey, fetcher);
  const duration = Math.max(0, Math.min(9999, Date.now() - start));
  if (result.status !== 302) return statusResponse(result.status, method, duration);
  return new Response(null, {
    status: 302,
    headers: {
      location: result.destination,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'x-ekodi-route': 'o2o-issued-link',
      'server-timing': 'o2o-resolve;dur=' + duration
    }
  });
}
