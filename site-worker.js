// Static Assets canonicalizes *.html URLs to extensionless paths.
// Always request canonical asset paths internally so edge redirects never escape the Worker.
const PUBLIC_HOST = 'ekodi.kr';
const PUBLIC_ALIAS_HOSTS = new Set(['www.ekodi.kr']);
const PUBLIC_ASSETS = new Set([
  '/homepage-ambient.css',
  '/homepage-ambient.js',
]);
const PUBLIC_ADMIN_ALIASES = new Set(['/admin', '/admin/']);

const ADMIN_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);

const AUTH_HOST = 'auth.ekodi.kr';
const AUTH_ASSETS = new Set(['/auth.js','/auth.css','/auth-router.js','/marketing-auth-hotfix.js','/auth-workspace-target.js','/admin-auth.js','/client-auth.js','/marketing-onboarding.js','/membership-ui.js']);
const AUTH_CRITICAL_ASSETS = new Set(['/auth-router.js','/admin-auth.js']);

const HUB_HOSTS = new Set([
  'pay.ekodi.kr',
  'pay.biz.ekodi.kr',
  'mail.ekodi.kr',
  'mail.biz.ekodi.kr',
  'mail.church.ekodi.kr',
  'live.ekodi.kr',
  'live.biz.ekodi.kr',
  'live.church.ekodi.kr',
  'live.lab.ekodi.kr',
  'cloud.ekodi.kr',
]);

const TRADE_CANONICAL_HOST = 'trade.biz.ekodi.kr';
const TRADE_LEGACY_HOSTS = new Set(['trade.ekodi.kr']);

const ADMIN_ALIASES = new Set([
  '/',
  '/admin',
  '/admin/',
  '/admin.html',
  '/index.html',
  '/control-center',
  '/control-center/',
  '/control-center.html',
  '/community',
  '/community/',
  '/books',
  '/books/',
  '/work',
  '/work/',
]);
const LEGACY_ALIASES = new Set(['/legacy','/legacy/','/legacy.html']);
const ADMIN_ASSETS = new Set([
  '/control-center.css',
  '/control-center-ops.css',
  '/control-center-finance.css',
  '/control-center.js',
  '/control-center-features.js',
  '/admin-central-handoff.js',
  '/admin-authenticated-shell.js',
  '/admin-demand-loader.js',
  '/admin-lazy-features.js',
  '/admin-menu-layout.js',
  '/finance-monitor.js',
  '/compact-control-center.css',
  '/compact-control-center.js',
  '/ekodi-device-bootstrap.cmd',
  '/campus-actions.css',
  '/campus-actions.js',
  '/ai-ops-admin.css',
  '/ai-ops-admin.js',
  '/mission-control-admin.css',
  '/mission-control-admin.js',
  '/work-admin.css',
  '/work-admin.js',
  '/client-access.css',
  '/client-access.js',
  '/marketing-funnel-admin.css',
  '/marketing-funnel-admin.js',
  '/marketing-ai-admin.css',
  '/marketing-ai-admin.js',
  '/google-admin-auth.css',
  '/google-admin-auth.js',
  '/domains-hub.css',
  '/domains-hub.js',
  '/social-admin.css',
  '/social-admin.js',
  '/release-control-admin.css',
  '/release-control-admin.js',
  '/community-reports-admin.css',
  '/community-reports-admin.js',
  '/books-admin.css',
  '/books-admin.js',
  '/books-finance-admin.css',
  '/books-finance-admin.js',
  '/author-billing-admin.css',
  '/author-billing-admin.js',
  '/system-health-admin.css',
  '/system-health-admin.js',
]);

const PUBLIC_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const ADMIN_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "img-src 'self' data:",
  "connect-src 'self' https://api.ekodi.kr https://finance-api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://api.github.com https://ekodi-auth-api.topmaster-joseph.workers.dev https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/ https://mall.ekodi.kr",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const AUTH_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "script-src 'self' https://cdn.jsdelivr.net https://esm.sh https://accounts.google.com/gsi/client https://js.tosspayments.com",
  "connect-src 'self' https://api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net https://esm.sh https://accounts.google.com/gsi/ https://*.tosspayments.com",
  "frame-src https://accounts.google.com/gsi/ https://accounts.google.com/ https://*.tosspayments.com",
  "img-src 'self' data: https://lh3.googleusercontent.com https://*.tosspayments.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://renzehysxirjilvdxacv.supabase.co https://*.tosspayments.com",
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

function applyBaseSecurityHeaders(headers) {
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  headers.set('X-XSS-Protection', '0');
}

function withHostSecurity(response, csp, cacheControl, routeName = '') {
  const secured = new Response(response.body, response);
  applyBaseSecurityHeaders(secured.headers);
  secured.headers.set('Content-Security-Policy', csp);
  secured.headers.set('Cache-Control', cacheControl);
  if (routeName.startsWith('admin-')) secured.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (routeName) secured.headers.set('X-EKODI-Route', routeName);
  return secured;
}

function redirectToPublicCanonical(url) {
  const next = new URL(url);
  next.protocol = 'https:';
  next.hostname = PUBLIC_HOST;
  const response = Response.redirect(next.toString(), 308);
  const secured = new Response(response.body, response);
  applyBaseSecurityHeaders(secured.headers);
  return secured;
}

function redirectToTradeCanonical(url) {
  const next = new URL(url);
  next.protocol = 'https:';
  next.hostname = TRADE_CANONICAL_HOST;
  const response = Response.redirect(next.toString(), 308);
  const secured = new Response(response.body, response);
  applyBaseSecurityHeaders(secured.headers);
  return secured;
}

function safeAdminReturnPath(value) {
  const candidate = String(value || '/');
  return ADMIN_ALIASES.has(candidate) ? candidate : '/';
}

function adminAuthRedirect(returnPath) {
  const safePath = safeAdminReturnPath(returnPath);
  const target = new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site', 'admin');
  target.searchParams.set('return_to', `https://admin.ekodi.kr${safePath}`);
  const response = new Response(null, {
    status: 302,
    headers: {
      'Location': target.toString(),
      'Cache-Control': 'no-store',
      'X-EKODI-Route': 'admin-auth-start',
    },
  });
  applyBaseSecurityHeaders(response.headers);
  return response;
}

function adminApexAuthUrl() {
  const target = new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site', 'admin');
  target.searchParams.set('return_to', 'https://ekodi.kr/admin');
  return target.toString();
}

async function fetchStatic(env, request, pathname) {
  return env.ASSETS.fetch(assetRequest(request, pathname));
}

async function serveAdminAsset(env, request, pathname) {
  if (!ADMIN_ASSETS.has(pathname)) return null;
  const response = await fetchStatic(env, request, pathname);
  if (!response.ok) return response;
  return withHostSecurity(response, ADMIN_CSP, 'private, max-age=300', 'admin-asset');
}

async function serveAuthAsset(env, request, pathname) {
  if (!AUTH_ASSETS.has(pathname)) return null;
  const response = await fetchStatic(env, request, pathname);
  if (!response.ok) return response;
  const cacheControl = AUTH_CRITICAL_ASSETS.has(pathname) ? 'no-store' : 'private, max-age=300';
  return withHostSecurity(response, AUTH_CSP, cacheControl, 'central-auth-asset');
}

async function serveAdmin(env, request, url) {
  const asset = ADMIN_ASSETS.has(url.pathname) ? await serveAdminAsset(env, request, url.pathname) : null;
  if (asset) return asset;
  if (LEGACY_ALIASES.has(url.pathname)) {
    const response = await fetchStatic(env, request, '/admin');
    return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-legacy');
  }
  if (ADMIN_ALIASES.has(url.pathname)) {
    const response = await fetchStatic(env, request, '/control-center');
    return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-control-center');
  }
  return new Response('Not Found', { status: 404 });
}

async function serveAuth(env, request, url) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const response = await fetchStatic(env, request, '/auth-center');
    return withHostSecurity(response, AUTH_CSP, 'no-store', 'central-auth');
  }
  const asset = await serveAuthAsset(env, request, url.pathname);
  return asset || new Response('Not Found', { status: 404 });
}

async function serveHub(env, request, host) {
  const response = await fetchStatic(env, request, '/hub');
  const secured = withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'service-hub');
  secured.headers.set('X-EKODI-Hub-Host', host);
  return secured;
}

async function serveTrade(env, request, url) {
  if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not Found', { status: 404 });
  const response = await fetchStatic(env, request, '/trade');
  return withHostSecurity(response, PUBLIC_CSP, 'public, max-age=300', 'trade-canonical');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (host === PUBLIC_HOST || PUBLIC_ALIAS_HOSTS.has(host)) {
      if (PUBLIC_ADMIN_ALIASES.has(url.pathname)) return Response.redirect(adminApexAuthUrl(), 302);
      const asset = PUBLIC_ASSETS.has(url.pathname) ? await fetchStatic(env, request, url.pathname) : null;
      if (asset) return withHostSecurity(asset, PUBLIC_CSP, 'public, max-age=300', 'public-asset');
      if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not Found', { status: 404 });
      if (PUBLIC_ALIAS_HOSTS.has(host)) return redirectToPublicCanonical(url);
      const response = await fetchStatic(env, request, '/');
      return withHostSecurity(response, PUBLIC_CSP, 'public, max-age=300', 'public-home');
    }

    if (ADMIN_HOSTS.has(host)) return serveAdmin(env, request, url);
    if (host === AUTH_HOST) return serveAuth(env, request, url);
    if (HUB_HOSTS.has(host)) return serveHub(env, request, host);
    if (TRADE_LEGACY_HOSTS.has(host)) return redirectToTradeCanonical(url);
    if (host === TRADE_CANONICAL_HOST) return serveTrade(env, request, url);

    return new Response('Unknown host', { status: 404 });
  },
};
