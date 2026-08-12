// Static Assets canonicalizes *.html URLs to extensionless paths.
// Always request canonical asset paths internally so edge redirects never escape the Worker.
const ADMIN_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);

const HUB_HOSTS = new Set([
  'pay.ekodi.kr',
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

const TRADE_CANONICAL_HOST = 'trade.ekodi.kr';
const TRADE_LEGACY_HOSTS = new Set(['trade.biz.ekodi.kr']);

const ADMIN_ALIASES = new Set([
  '/',
  '/admin',
  '/admin/',
  '/admin.html',
  '/index.html',
  '/control-center',
  '/control-center/',
  '/control-center.html',
]);
const LEGACY_ALIASES = new Set(['/legacy','/legacy/','/legacy.html']);

const ADMIN_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.ekodi.kr https://finance-api.ekodi.kr https://ekodi-auth-api.topmaster-joseph.workers.dev",
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

function withHostSecurity(response, csp, cacheControl, routeName = '') {
  const secured = new Response(response.body, response);
  secured.headers.set('Content-Security-Policy', csp);
  secured.headers.set('Cache-Control', cacheControl);
  if (routeName) secured.headers.set('X-EKODI-Route', routeName);
  return secured;
}

function redirectToTradeCanonical(url) {
  const next = new URL(url);
  next.protocol = 'https:';
  next.hostname = TRADE_CANONICAL_HOST;
  return Response.redirect(next.toString(), 308);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (TRADE_LEGACY_HOSTS.has(host)) {
      return redirectToTradeCanonical(url);
    }

    if (host === TRADE_CANONICAL_HOST && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/trade'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'trade');
    }

    if (ADMIN_HOSTS.has(host)) {
      if (ADMIN_ALIASES.has(url.pathname)) {
        const response = await env.ASSETS.fetch(assetRequest(request, '/control-center'));
        return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-control-center');
      }

      if (LEGACY_ALIASES.has(url.pathname)) {
        const response = await env.ASSETS.fetch(assetRequest(request, '/admin'));
        return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-legacy');
      }
    }

    if (HUB_HOSTS.has(host) && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/hub'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'hub');
    }

    return env.ASSETS.fetch(request);
  },
};
