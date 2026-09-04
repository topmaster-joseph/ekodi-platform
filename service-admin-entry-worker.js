const CENTRAL_ADMIN = 'https://admin.ekodi.kr/';
const ADMIN_ROOTS = new Set(['/admin', '/admin/']);
const EXPERIENCE_LEGACY_PREFIX = '/experience';

function securityHeaders(headers) {
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set('X-EKODI-Admin-Entry', 'central-handoff-v1');
  return headers;
}

function experienceLegacyHandoff(request) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: securityHeaders(new Headers({ Allow: 'GET, HEAD' })) });
  }
  const target = new URL(CENTRAL_ADMIN);
  target.searchParams.set('route', 'campus');
  target.searchParams.set('source', 'try.ekodi.kr');
  const redirect = Response.redirect(target.toString(), 307);
  const response = new Response(redirect.body, redirect);
  securityHeaders(response.headers);
  return response;
}
function centralHandoff(request, url) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: securityHeaders(new Headers({ Allow: 'GET, HEAD' })) });
  }
  const target = new URL(CENTRAL_ADMIN);
  target.searchParams.set('source', url.hostname.toLowerCase());
  const redirect = Response.redirect(target.toString(), 307);
  const response = new Response(redirect.body, redirect);
  securityHeaders(response.headers);
  return response;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() === 'admin.ekodi.kr' && (url.pathname === EXPERIENCE_LEGACY_PREFIX || url.pathname.startsWith(`${EXPERIENCE_LEGACY_PREFIX}/`))) {
      return experienceLegacyHandoff(request);
    }
    if (url.pathname === '/__health') {
      return new Response(JSON.stringify({ ok: true, service: 'ekodi-service-admin-entry', mode: 'central-handoff-v1' }), {
        headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })),
      });
    }
    if (ADMIN_ROOTS.has(url.pathname) || url.pathname.startsWith('/admin/')) return centralHandoff(request, url);
    return fetch(request);
  },
};
