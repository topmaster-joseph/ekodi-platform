import { injectEkodiShell } from './ekodi-shell-injector.js';
import { isWorkspaceAdminPath, workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from './workspace-admin-page.js';
import { churchPastorAdminPage, churchPastorAdminScript, isChurchPastorAdminPath } from './church-pastor-admin-page.js';
import { ekodiBizInvestBusinessPage, isEkodiBizInvestPath } from './ekodibiz-invest-business.js';
import { ekodiBizInvestAdminPage, isEkodiBizInvestAdminPath } from './ekodibiz-invest-admin-page.js';

// Static Assets canonicalizes *.html URLs to extensionless paths.
// Always request canonical asset paths internally so edge redirects never escape the Worker.
const PUBLIC_HOST = 'ekodi.kr';
const PUBLIC_ALIAS_HOSTS = new Set(['www.ekodi.kr']);
const MALL_PREFIX = '/ekodibiz/mall';
const LEGACY_MALL_PREFIX = '/mall';
const LEGACY_EKODIBIZ_PREFIX = '/org/ekodibiz';
const MALL_ORIGIN_HOST = 'ekodi-mall.pages.dev';
const MALL_PROXY_HEADER = 'x-ekodi-canonical-proxy';
const PUBLIC_ASSETS = new Set([
  '/homepage-ambient.css',
  '/homepage-ambient.js',
  '/ekodi-message-ui.js',
  '/mall.css',
  '/mall.js',
]);
const PUBLIC_ADMIN_ALIASES = new Set(['/admin', '/admin/']);

const ADMIN_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);
const ADMIN_STORAGE_PREFIX = '/api/control/storage/';
const ADMIN_MARKETING_PUBLISHING_PREFIX = '/api/control/marketing-publishing';
const ADMIN_COMMON_SERVICE_AI_PREFIX = '/api/control/common-services/ai/';

const AUTH_HOST = 'auth.ekodi.kr';
const AUTH_ASSETS = new Set(['/auth.js','/auth.css','/auth-router.js','/oauth-consent.js','/marketing-auth-hotfix.js','/auth-workspace-target.js','/admin-auth.js','/client-auth.js','/author-auth.js','/business-auth.js','/marketing-onboarding.js','/membership-ui.js']);
const AUTH_CRITICAL_ASSETS = new Set(['/auth.js','/auth-router.js','/oauth-consent.js','/marketing-auth-hotfix.js','/auth-workspace-target.js','/admin-auth.js','/client-auth.js','/author-auth.js','/business-auth.js','/marketing-onboarding.js','/membership-ui.js']);

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
  '/index.html',
  '/community',
  '/community/',
  '/books',
  '/books/',
  '/work',
  '/work/',
]);
const RETIRED_ADMIN_PATHS = new Set([
  '/admin.html',
  '/control-center',
  '/control-center/',
  '/control-center.html',
  '/legacy',
  '/legacy/',
  '/legacy.html',
  '/control-center.js',
  '/control-center-features.js',
  '/control-center-ops.css',
  '/control-center.css',
  '/control-center-finance.css',
  '/compact-control-center.css',
  '/compact-control-center.js',
]);
const ADMIN_ASSETS = new Set([
  '/ekodi-message-ui.js',
  '/admin-shell.css',
  '/admin-finance.css',
  '/admin-central-handoff.js',
  '/admin-authenticated-shell.js',
  '/admin-public-site-controls.js',
  '/admin-demand-loader.js',
  '/admin-perf-diagnostics.js',
  '/admin-lazy-features.js',
  '/admin-menu-layout.js',
  '/admin-menu-registry.js',
  '/admin-sidebar.js',
  '/admin-menu-runtime.js',
  '/homepage-admin.js',
  '/finance-monitor.js',
  '/admin-compact.css',
  '/admin-compact.js',
  '/ekodi-device-bootstrap.cmd',
  '/campus-actions.css',
  '/campus-actions.js',
  '/device-control-admin.css',
  '/device-control-admin.js',
  '/device-browser-diagnostics.css',
  '/device-browser-diagnostics.js',
  '/ai-ops-admin.css',
  '/ai-ops-admin.js',
  '/common-services-admin.css',
  '/common-services-admin.js',
  '/life-ai-admin.css',
  '/life-ai-admin.js',
  '/personal-finance-admin.css',
  '/personal-finance-admin.js',
  '/mission-control-admin.css',
  '/mission-control-admin.js',
  '/work-admin.css',
  '/work-admin.js',
  '/communication-admin.css',
  '/communication-admin.js',
  '/client-access.css',
  '/client-access.js',
  '/marketing-funnel-admin.css',
  '/marketing-funnel-admin.js',
  '/insurance-admin.css',
  '/insurance-admin.js',
  '/insurance-network-admin.css',
  '/insurance-network-admin.js',
  '/insurance-advisor-admin.css',
  '/insurance-advisor-admin.js',
  '/insurance-practice-admin.css',
  '/insurance-practice-admin.js',
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
  '/storage-admin.css',
  '/storage-admin.js',
]);

const PUBLIC_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https://api.ekodi.kr",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const MALL_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.tosspayments.com",
  "connect-src 'self' https://api.ekodi.kr https://mall-api.ekodi.kr https://mall-api-staging.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://*.tosspayments.com",
  "frame-src https://*.tosspayments.com",
  "img-src 'self' data: blob: https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://ekodibiz.kr https://*.tosspayments.com",
  "object-src 'none'",
].join('; ');

const MALL_ADMIN_EMBED_CSP = MALL_CSP.replace("frame-ancestors 'none'", 'frame-ancestors https://admin.ekodi.kr');

const ADMIN_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "img-src 'self' data:",
  "connect-src 'self' https://api.ekodi.kr https://finance-api.ekodi.kr https://personal-finance-api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://api.github.com https://ekodi-auth-api.topmaster-joseph.workers.dev https://accounts.google.com/gsi/ https://life.ekodi.kr",
  "frame-src https://accounts.google.com/gsi/ https://ekodi.kr",
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

function isMallPath(pathname) {
  return pathname === MALL_PREFIX || pathname.startsWith(`${MALL_PREFIX}/`);
}

function isMallVerificationOpsPath(pathname) {
  return pathname === `${MALL_PREFIX}/verification-ops`
    || pathname === `${MALL_PREFIX}/verification-ops/`
    || pathname === `${MALL_PREFIX}/assets/verification-ops`
    || pathname === `${MALL_PREFIX}/assets/verification-ops.html`;
}

function isLegacyMallPath(pathname) {
  return pathname === LEGACY_MALL_PREFIX || pathname.startsWith(`${LEGACY_MALL_PREFIX}/`);
}

function isLegacyEkodiBizPath(pathname) {
  return pathname === LEGACY_EKODIBIZ_PREFIX || pathname.startsWith(`${LEGACY_EKODIBIZ_PREFIX}/`);
}

function redirectLegacyEkodiBizPath(request) {
  const target = new URL(request.url);
  target.pathname = `/ekodibiz${target.pathname.slice(LEGACY_EKODIBIZ_PREFIX.length)}`;
  const response = new Response(null, { status: 308, headers: { Location: target.toString() } });
  applyBaseSecurityHeaders(response.headers);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-EKODI-Route', 'ekodibiz-legacy-canonical-redirect');
  return response;
}

function redirectLegacyMallPath(request) {
  const target = new URL(request.url);
  target.pathname = `${MALL_PREFIX}${target.pathname.slice(LEGACY_MALL_PREFIX.length)}`;
  const response = new Response(null, { status: 308, headers: { Location: target.toString() } });
  applyBaseSecurityHeaders(response.headers);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-EKODI-Route', 'mall-legacy-canonical-redirect');
  return response;
}

function mallUpstreamPath(pathname) {
  const suffix = pathname.slice(MALL_PREFIX.length);
  return suffix || '/';
}

function rewriteMallHtmlDocument(html) {
  return String(html || '').replace(
    /\b(href|src|action)=("|')\/(?!\/|ekodibiz\/mall(?:\/|["']))([^"']*)\2/gi,
    (_, attribute, quote, suffix) => `${attribute}=${quote}${MALL_PREFIX}/${suffix}${quote}`,
  );
}
async function proxyMallService(request) {
  const incoming = new URL(request.url);
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = MALL_ORIGIN_HOST;
  upstream.port = '';
  upstream.pathname = mallUpstreamPath(incoming.pathname);

  const upstreamRequest = new Request(upstream.toString(), request);
  upstreamRequest.headers.set(MALL_PROXY_HEADER, 'apex-mall-v1');
  const upstreamResponse = await fetch(upstreamRequest, { redirect: 'manual' });
  const headers = new Headers(upstreamResponse.headers);
  const location = headers.get('location');
  if (location) {
    try {
      const redirect = new URL(location, upstream);
      if (redirect.hostname === MALL_ORIGIN_HOST) {
        redirect.protocol = 'https:';
        redirect.hostname = PUBLIC_HOST;
        redirect.pathname = redirect.pathname === '/' ? MALL_PREFIX : `${MALL_PREFIX}${redirect.pathname}`;
        headers.set('location', redirect.toString());
      }
    } catch {}
  }
  let responseBody = upstreamResponse.body;
  if ((headers.get('content-type') || '').toLowerCase().includes('text/html')) {
    responseBody = rewriteMallHtmlDocument(await upstreamResponse.text());
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
  }
  headers.set('x-ekodi-edge', 'mall-path-gateway');
  headers.set('x-ekodi-service', 'mall');
  const adminSurface = incoming.pathname === `${MALL_PREFIX}/admin` || incoming.pathname.startsWith(`${MALL_PREFIX}/admin/`);
  const apiSurface = incoming.pathname === `${MALL_PREFIX}/api` || incoming.pathname.startsWith(`${MALL_PREFIX}/api/`);
  const verificationOpsSurface = isMallVerificationOpsPath(incoming.pathname);
  const adminEmbed = incoming.searchParams.get('embed') === 'admin';
  const cacheControl = adminSurface || apiSurface || verificationOpsSurface || adminEmbed ? 'no-store' : 'public, max-age=0, must-revalidate';
  const route = adminSurface ? 'admin-mall-proxy' : apiSurface ? 'mall-api-proxy' : verificationOpsSurface ? 'mall-verification-ops' : 'public-ekodi-mall';
  const mallCsp = adminEmbed ? MALL_ADMIN_EMBED_CSP : MALL_CSP;
  const response = withHostSecurity(new Response(responseBody, { status: upstreamResponse.status, statusText: upstreamResponse.statusText, headers }), mallCsp, cacheControl, route);
  if (verificationOpsSurface) response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (adminEmbed) response.headers.delete('X-Frame-Options');
  return injectEkodiShell(response, 'mall', adminSurface ? 'admin' : 'public');
}

function retiredAdminResponse() {
  return withHostSecurity(new Response('Not Found', { status: 404 }), ADMIN_CSP, 'no-store', 'admin-retired');
}

function adminAssetCacheControl(url) {
  return url.searchParams.has('v')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate';
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
  target.searchParams.set('direct', '1');
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
  target.searchParams.set('direct', '1');
  target.searchParams.set('return_to', 'https://ekodi.kr/admin');
  return target.toString();
}

function rewriteAdminApexLogin(response) {
  const loginUrl = adminApexAuthUrl();
  return new HTMLRewriter()
    .on('#centralAdminLogin', {
      element(element) {
        element.setAttribute('href', loginUrl);
      },
    })
    .transform(response);
}

async function proxyAdminStorage(request, env) {
  if (!env.STORAGE?.fetch) {
    return withHostSecurity(new Response(JSON.stringify({error:'Storage service binding unavailable',code:'STORAGE_BINDING_UNAVAILABLE'}), {
      status:503,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    }), ADMIN_CSP, 'no-store', 'admin-storage-proxy');
  }
  const upstream = await env.STORAGE.fetch(request);
  const response = new Response(upstream.body, upstream);
  response.headers.set('X-EKODI-Storage-Proxy', 'service-binding-v1');
  return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-storage-proxy');
}

async function proxyAdminCommonServiceAi(request) {
  const url = new URL(request.url);
  const suffix = url.pathname.slice(ADMIN_COMMON_SERVICE_AI_PREFIX.length);
  if (!/^(?:status|session|tasks(?:\/[a-z0-9._~-]+(?:\/(?:run|approve))?)?|nodes(?:\/pair)?)$/i.test(suffix)) {
    return withHostSecurity(new Response(JSON.stringify({error:'NOT_FOUND'}), {status:404,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}), ADMIN_CSP, 'no-store', 'admin-common-service-ai-proxy');
  }
  const target = new URL('https://ai.ekodi.kr');
  target.pathname = '/api/' + suffix;
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.set('x-ekodi-admin-proxy', 'common-service-v1');
  const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target.toString(), {method:request.method,headers,body,redirect:'manual'});
  const response = new Response(upstream.body, upstream);
  response.headers.set('X-EKODI-Common-Service-Proxy', 'ai-runtime-v1');
  return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-common-service-ai-proxy');
}
async function proxyAdminMarketingPublishing(request) {
  const url = new URL(request.url);
  const suffix = url.pathname.slice(ADMIN_MARKETING_PUBLISHING_PREFIX.length) || '/health';
  if (!(suffix === '/health' || suffix.startsWith('/v1/'))) {
    return withHostSecurity(new Response(JSON.stringify({error:'NOT_FOUND'}), {
      status:404,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    }), ADMIN_CSP, 'no-store', 'admin-marketing-publishing-proxy');
  }
  const target = new URL('https://marketing-publish-api.ekodi.kr');
  target.pathname = suffix;
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.delete('origin');
  headers.delete('host');
  const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target.toString(), {method:request.method,headers,body,redirect:'manual'});
  const response = new Response(upstream.body, upstream);
  response.headers.set('X-EKODI-Marketing-Publishing-Proxy', 'same-origin-v1');
  return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-marketing-publishing-proxy');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (PUBLIC_ALIAS_HOSTS.has(host)) return redirectToPublicCanonical(url);

    if ((url.pathname === '/admin' || url.pathname === '/admin/') && host !== PUBLIC_HOST && !ADMIN_HOSTS.has(host)) {
      const target = new URL('https://admin.ekodi.kr/');
      target.searchParams.set('source', host);
      const response = new Response(null, { status: 307, headers: { Location: target.toString() } });
      applyBaseSecurityHeaders(response.headers);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return response;
    }

    if (host === PUBLIC_HOST) {
      if (RETIRED_ADMIN_PATHS.has(url.pathname)) return retiredAdminResponse();
      if (url.pathname === '/oauth/consent' || url.pathname === '/cgma/oauth/consent') {
        const target = new URL('https://auth.ekodi.kr/oauth/consent');
        target.search = url.search;
        const response = new Response(null, { status:307, headers:{ Location:target.toString(), 'Cache-Control':'no-store' } });
        applyBaseSecurityHeaders(response.headers);
        return response;
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const response = await env.ASSETS.fetch(assetRequest(request, '/'));
        return withHostSecurity(response, PUBLIC_CSP, 'no-store', 'public-home');
      }
      if (url.pathname === '/workspace-admin.css') return workspaceAdminCss();
      if (url.pathname === '/workspace-admin.js') return workspaceAdminScript();
      if (url.pathname === '/church-pastor-admin.js') return churchPastorAdminScript();
      if (['GET','HEAD'].includes(request.method) && isEkodiBizInvestAdminPath(url.pathname)) {
        const page=ekodiBizInvestAdminPage(request);
        const secured=withHostSecurity(page, ADMIN_CSP, 'no-store', 'public-ekodibiz-invest-admin');
        return injectEkodiShell(secured, 'biz', 'admin');
      }
      if (isLegacyEkodiBizPath(url.pathname)) return redirectLegacyEkodiBizPath(request);
      if (isLegacyMallPath(url.pathname)) return redirectLegacyMallPath(request);
      if (['GET','HEAD'].includes(request.method) && isChurchPastorAdminPath(url.pathname)) return churchPastorAdminPage();
      if (isWorkspaceAdminPath(url.pathname)) return workspaceAdminPage();
      if (['GET','HEAD'].includes(request.method) && isEkodiBizInvestPath(url.pathname)) {
        const page=ekodiBizInvestBusinessPage(request);
        const secured=withHostSecurity(page, PUBLIC_CSP, 'public, max-age=0, must-revalidate', 'public-ekodibiz-invest');
        return injectEkodiShell(secured, 'biz', 'public');
      }
      if (url.pathname === '/mall.html') {
        const canonical = new URL(request.url);
        canonical.pathname = MALL_PREFIX;
        const response = new Response(null, { status: 308, headers: { Location: canonical.toString() } });
        applyBaseSecurityHeaders(response.headers);
        return response;
      }
      if (isMallPath(url.pathname)) return proxyMallService(request);
      if (PUBLIC_ADMIN_ALIASES.has(url.pathname)) {
        const response = await env.ASSETS.fetch(assetRequest(request, '/admin-shell'));
        const rewritten = rewriteAdminApexLogin(response);
        return withHostSecurity(rewritten, ADMIN_CSP, 'no-store', 'admin-fallback');
      }
      if (ADMIN_ASSETS.has(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        return withHostSecurity(response, ADMIN_CSP, adminAssetCacheControl(url), 'admin-fallback-asset');
      }
      if (PUBLIC_ASSETS.has(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        return withHostSecurity(response, PUBLIC_CSP, 'public, max-age=0, must-revalidate', 'public-asset');
      }
    }

    if (TRADE_LEGACY_HOSTS.has(host)) return redirectToTradeCanonical(url);

    if (host === TRADE_CANONICAL_HOST && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/trade'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'trade');
    }

    if (ADMIN_HOSTS.has(host)) {
      if (RETIRED_ADMIN_PATHS.has(url.pathname)) return retiredAdminResponse();
      if (url.pathname.startsWith(ADMIN_STORAGE_PREFIX)) return proxyAdminStorage(request, env);
      if (url.pathname.startsWith(ADMIN_MARKETING_PUBLISHING_PREFIX)) return proxyAdminMarketingPublishing(request);
      if (url.pathname.startsWith(ADMIN_COMMON_SERVICE_AI_PREFIX)) return proxyAdminCommonServiceAi(request);
      if (url.pathname === '/auth/start') {
        if (!['GET', 'HEAD'].includes(request.method)) {
          const response = new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'GET, HEAD' } });
          applyBaseSecurityHeaders(response.headers);
          return response;
        }
        return adminAuthRedirect(url.searchParams.get('return_to'));
      }
      if (ADMIN_ALIASES.has(url.pathname)) {
        const response = await env.ASSETS.fetch(assetRequest(request, '/admin-shell'));
        return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-shell');
      }
      if (ADMIN_ASSETS.has(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        return withHostSecurity(response, ADMIN_CSP, adminAssetCacheControl(url), 'admin-asset');
      }
    }

    if (host === AUTH_HOST) {
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/login' || url.pathname === '/login/') {
        const response = await env.ASSETS.fetch(assetRequest(request, '/auth-center'));
        return withHostSecurity(response, AUTH_CSP, 'no-store', 'central-auth');
      }
      if (url.pathname === '/oauth/consent' || url.pathname === '/oauth/consent/') {
        const response = await env.ASSETS.fetch(assetRequest(request, '/oauth-consent'));
        return withHostSecurity(response, AUTH_CSP, 'no-store', 'oauth-consent');
      }
      if (AUTH_ASSETS.has(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        const cacheControl = AUTH_CRITICAL_ASSETS.has(url.pathname) ? 'no-store' : 'public, max-age=300';
        return withHostSecurity(response, AUTH_CSP, cacheControl, 'central-auth-asset');
      }
    }

    if (HUB_HOSTS.has(host) && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/hub'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'hub');
    }

    return env.ASSETS.fetch(request);
  },
};