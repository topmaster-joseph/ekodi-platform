const ADMIN_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);

const HUB_HOSTS = new Set([
  'mail.ekodi.kr',
  'mail.biz.ekodi.kr',
  'mail.church.ekodi.kr',
  'live.ekodi.kr',
  'live.biz.ekodi.kr',
  'live.church.ekodi.kr',
  'live.lab.ekodi.kr',
  'cloud.ekodi.kr',
  'auth.ekodi.kr',
]);

const ADMIN_ALIASES = new Set([
  '/admin',
  '/admin/',
  '/admin.html',
  '/index.html',
]);

const ADMIN_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.ekodi.kr https://ekodi-auth-api.topmaster-joseph.workers.dev",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const HUB_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function withHostSecurity(response, csp, cacheControl) {
  const secured = new Response(response.body, response);
  secured.headers.set('Content-Security-Policy', csp);
  secured.headers.set('Cache-Control', cacheControl);
  return secured;
}

function redirectToAdminRoot(url) {
  const canonical = new URL(url);
  canonical.pathname = '/';
  return Response.redirect(canonical.toString(), 308);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (ADMIN_HOSTS.has(host)) {
      if (ADMIN_ALIASES.has(url.pathname)) {
        if (url.pathname !== '/') return redirectToAdminRoot(url);
      }

      if (url.pathname === '/') {
        const response = await env.ASSETS.fetch(assetRequest(request, '/admin.html'));
        return withHostSecurity(response, ADMIN_CSP, 'no-store');
      }
    }

    if (HUB_HOSTS.has(host) && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/hub.html'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300');
    }

    return env.ASSETS.fetch(request);
  },
};
