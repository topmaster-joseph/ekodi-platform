// Static Assets canonicalizes *.html URLs to extensionless paths.
// Always request canonical asset paths internally so edge redirects never escape the Worker.
const ADMIN_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);

const AUTH_HOST = 'auth.ekodi.kr';

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
]);
const LEGACY_ALIASES = new Set(['/legacy','/legacy/','/legacy.html']);
const ADMIN_ASSETS = new Set([
  '/control-center.css',
  '/control-center-ops.css',
  '/control-center-finance.css',
  '/control-center.js',
  '/admin-central-handoff.js',
  '/compact-control-center.css',
  '/compact-control-center.js',
  '/client-access.css',
  '/client-access.js',
  '/marketing-funnel-admin.css',
  '/marketing-funnel-admin.js',
  '/google-admin-auth.css',
  '/google-admin-auth.js',
]);

const ADMIN_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "img-src 'self' data:",
  "connect-src 'self' https://api.ekodi.kr https://finance-api.ekodi.kr https://ekodi-auth-api.topmaster-joseph.workers.dev https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const AUTH_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "script-src 'self' https://cdn.jsdelivr.net https://accounts.google.com/gsi/client",
  "connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/ https://accounts.google.com/",
  "img-src 'self' data: https://lh3.googleusercontent.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://renzehysxirjilvdxacv.supabase.co",
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
  secured.headers.set('Referrer-Policy', 'no-referrer');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  if (routeName.startsWith('admin-')) secured.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
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

      // Keep old bookmarks working, but never render the obsolete legacy shell.
      // All legacy aliases are served from the canonical Control Center asset.
      if (LEGACY_ALIASES.has(url.pathname)) {
        const response = await env.ASSETS.fetch(assetRequest(request, '/control-center'));
        return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-control-center');
      }

      // Admin UI assets must never be allowed to lag behind the shell. A stale CSS
      // file can visually regress navigation even when the new HTML/JS is live.
      if (ADMIN_ASSETS.has(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-asset');
      }
    }

    if (host === AUTH_HOST) {
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/login' || url.pathname === '/login/') {
        const response = await env.ASSETS.fetch(assetRequest(request, '/auth-center'));
        return withHostSecurity(response, AUTH_CSP, 'no-store', 'central-auth');
      }
      if (['/auth.js','/auth.css','/auth-router.js','/admin-auth.js','/client-auth.js'].includes(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        return withHostSecurity(response, AUTH_CSP, 'public, max-age=300', 'central-auth-asset');
      }
    }

    if (HUB_HOSTS.has(host) && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/hub'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'hub');
    }

    return env.ASSETS.fetch(request);
  },
};