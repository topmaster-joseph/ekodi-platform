import { resolveO2OTarget } from './o2o-link-core.js';

// Public O2O campaign codes are opaque 192-bit random tokens, NOT authentication,
// payment, check-in or verified attendance credentials.
const CAMPAIGN_ROUTE = /^\/o2o\/go\/([0-9a-f]{48})$/;
const PREFIX = '/o2o/go/';
function statusResponse(status) {
  return new Response(status === 503 ? '일시적으로 사용할 수 없습니다.' : status === 405 ? 'Method Not Allowed' : '찾을 수 없는 QR 링크입니다.', {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'x-ekodi-route': 'o2o-issued-link',
      ...(status === 405 ? { allow: 'GET, HEAD' } : {})
    }
  });
}
export function isO2OIssuedLinkPath(pathname) {
  return String(pathname || '').startsWith(PREFIX);
}
export async function o2oIssuedLinkResponse(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (!isO2OIssuedLinkPath(url.pathname)) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return statusResponse(405);
  const matched = CAMPAIGN_ROUTE.exec(url.pathname);
  if (!matched || url.search || url.hash) return statusResponse(404);
  const base = String(env?.SUPABASE_URL || '');
  const key = String(env?.SUPABASE_PUBLISHABLE_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !key) return statusResponse(503);
  try {
    const response = await fetcher(base + '/rest/v1/rpc/o2o_public_resolve', {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ p_token: matched[1] }),
      signal: AbortSignal.timeout(4500),
      redirect: 'error'
    });
    if (!response.ok) return statusResponse(response.status >= 500 ? 503 : 404);
    const result = await response.json();
    if (result?.ok !== true) return statusResponse(404);
    // The DB result is an untrusted external input. Recheck the public URL contract.
    const resolved = resolveO2OTarget({
      siteId: String(result.site_id || ''),
      targetPath: String(result.target_path || '')
    });
    if (!resolved.url.startsWith('https://ekodi.kr/')) return statusResponse(404);
    return new Response(null, {
      status: 302,
      headers: {
        location: resolved.url,
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow, noarchive',
        'x-ekodi-route': 'o2o-issued-link'
      }
    });
  } catch {
    // Invalid stored paths fail closed rather than becoming open redirects.
    return statusResponse(503);
  }
}
