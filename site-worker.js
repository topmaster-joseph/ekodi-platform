import { injectEkodiShell } from './ekodi-shell-injector.js';
import { isWorkspaceAdminPath, workspaceAdminPage, workspaceAdminCss, workspaceAdminScript } from './workspace-admin-page.js';
import { legacyAdminAliasTarget } from './admin-address-policy.js';
import { churchPastorAdminPage, churchPastorAdminScript, isChurchPastorAdminPath } from './church-pastor-admin-page.js';
import { ekodiBizInvestBusinessPage, isEkodiBizInvestPath } from './ekodibiz-invest-business.js';
import { ekodiBizInvestAdminPage, isEkodiBizInvestAdminPath } from './ekodibiz-invest-admin-page.js';
import { tenantAdminCommandHomeScript, tenantAdminCommandHomeCss } from './tenant-admin-command-home.js';
import { decorateDiscoveryResponse } from './discovery-layer.js';
import { realtimeTenantAdminFromPath, realtimeTenantFromPath } from './realtime-tenant-registry.js';
import { tenantLivePage } from './tenant-live-page.js';
import { tenantLiveAdminCss, tenantLiveAdminPage, tenantLiveAdminScript } from './tenant-live-admin-page.js';

// Static Assets canonicalizes *.html URLs to extensionless paths.
// Always request canonical asset paths internally so edge redirects never escape the Worker.
const PUBLIC_HOST = 'ekodi.kr';
const PUBLIC_ALIAS_HOSTS = new Set(['www.ekodi.kr']);
const MALL_PREFIX = '/ekodibiz/ekodimall';
const MALL_ROOT_ALIAS_PREFIX = '/ekodimall';
const FORMER_MALL_PREFIX = '/ekodibiz/mall';
const LEGACY_MALL_PREFIX = '/mall';
const LEGACY_EKODIBIZ_PREFIX = '/org/ekodibiz';
const MALL_ORIGIN_HOST = 'ekodi-mall.pages.dev';
const MALL_PROXY_HEADER = 'x-ekodi-canonical-proxy';
const PUBLIC_ASSETS = new Set([
  '/homepage-ambient.css',
  '/homepage-ambient.js',
  '/ekodi-message-ui.js',
  '/tenant-live.css',
  '/tenant-live.js',
  '/mall.css',
  '/mall.js',
  '/pizzamaru-mokpodae.css',
  '/pizzamaru-mokpodae.js',
]);
const PUBLIC_ADMIN_ALIASES = new Set(['/admin', '/admin/']);
const WORKSPACE_ADMIN_ASSET_ALIASES = new Map([
  ['/cgma/admin/assets/cgma-member-admin.js','/cgma-member-admin.js'],
  ['/cgma/admin/assets/cgma-member-admin.css','/cgma-member-admin.css'],
]);

const ADMIN_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);
const ADMIN_STORAGE_PREFIX = '/api/control/storage/';
const ADMIN_PERSONAL_FINANCE_PATH = '/api/control/personal-finance';
const ADMIN_MARKETING_PUBLISHING_PREFIX = '/api/control/marketing-publishing';
const ADMIN_COMMON_SERVICE_AI_PREFIX = '/api/control/common-services/ai/';

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
  '/admin-canonical-routes.js',
  '/admin-surface-labels.js',
  '/admin-central-handoff.js',
  '/admin-authenticated-shell.js',
  '/admin-public-site-controls.js',
  '/admin-language-status.js',
  '/admin-demand-loader.js',
  '/admin-perf-diagnostics.js',
  '/admin-lazy-features.js',
  '/admin-menu-layout.js',
  '/admin-menu-registry.js',
  '/admin-service-handoffs.js',
  '/admin-service-catalog.js',
  '/admin-sidebar.js',
  '/admin-menu-runtime.js',
  '/ekodibiz-admin-registry.js',
  '/admin-design-engine.js',
  '/admin-design-engine.css',
  '/homepage-admin.js',
  '/finance-monitor.js',
  '/admin-compact.css',
  '/admin-compact.js',
  '/ekodi-device-bootstrap.cmd',
  '/campus-actions.css',
  '/campus-actions.js',
  '/device-control-admin.css',
  '/device-control-admin.js',
  '/tapo-device-admin.css',
  '/tapo-device-admin.js',
  '/device-browser-diagnostics.css',
  '/device-browser-diagnostics.js',
  '/ai-ops-admin.css',
  '/ai-ops-admin.js',
  '/ai-operations-center-admin.js',
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
  '/community-admin.css',
  '/community-admin.js',
  '/marketing-funnel-admin.css',
  '/marketing-funnel-admin.js',
  '/cgma-member-admin.css',
  '/cgma-member-admin.js',
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
  '/church-reports-admin.css',
  '/church-reports-admin.js',
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
  "connect-src 'self' https://ekodi.kr",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const LIVE_CSP = PUBLIC_CSP.replace("connect-src 'self' https://ekodi.kr","connect-src 'self' https://renzehysxirjilvdxacv.supabase.co");

const MALL_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.tosspayments.com",
  "connect-src 'self' https://ekodi.kr https://mall-api.ekodi.kr https://mall-api-staging.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://*.tosspayments.com",
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
  "connect-src 'self' https://ekodi.kr https://finance-api.ekodi.kr https://personal-finance-api.ekodi.kr https://marketing-connect-api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://api.github.com https://ekodi-auth-api.topmaster-joseph.workers.dev https://accounts.google.com/gsi/ https://life.ekodi.kr",
  "frame-src https://accounts.google.com/gsi/ https://ekodi.kr",
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

function applyBaseSecurityHeaders(headers) {
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  headers.set('X-XSS-Protection', '0');
}

function ensureUtf8TextContentType(headers) {
  const type = String(headers.get('Content-Type') || '');
  if (!type || /;\s*charset=/i.test(type)) return;
  if (/^text\//i.test(type) || /^application\/(?:javascript|json|xml)(?:;|$)/i.test(type)) {
    headers.set('Content-Type', `${type}; charset=utf-8`);
  }
}
function withHostSecurity(response, csp, cacheControl, routeName = '') {
  const secured = new Response(response.body, response);
  applyBaseSecurityHeaders(secured.headers);
  ensureUtf8TextContentType(secured.headers);
  secured.headers.set('Content-Security-Policy', csp);
  secured.headers.set('Cache-Control', cacheControl);
  if (routeName.startsWith('admin-')) {
    secured.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  if (routeName) secured.headers.set('X-EKODI-Route', routeName);
  return secured;
}

function isMallPath(pathname) {
  return pathname === MALL_PREFIX || pathname.startsWith(`${MALL_PREFIX}/`);
}

function isRootMallPath(pathname) {
  return pathname === MALL_ROOT_ALIAS_PREFIX || pathname.startsWith(`${MALL_ROOT_ALIAS_PREFIX}/`);
}

function isRootMallAdminPath(pathname) {
  return pathname === `${MALL_ROOT_ALIAS_PREFIX}/admin` || pathname.startsWith(`${MALL_ROOT_ALIAS_PREFIX}/admin/`);
}

function isMallVerificationOpsPath(pathname, prefix = MALL_PREFIX) {
  return pathname === `${prefix}/verification-ops`
    || pathname === `${prefix}/verification-ops/`
    || pathname === `${prefix}/assets/verification-ops`
    || pathname === `${prefix}/assets/verification-ops.html`;
}

function isLegacyMallPath(pathname) {
  return pathname === LEGACY_MALL_PREFIX || pathname.startsWith(`${LEGACY_MALL_PREFIX}/`);
}

function isFormerMallPath(pathname) {
  return pathname === FORMER_MALL_PREFIX || pathname.startsWith(`${FORMER_MALL_PREFIX}/`);
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

function redirectLegacyAdminAliasPath(request) {
  const target = new URL(request.url);
  const canonical = legacyAdminAliasTarget(target.pathname);
  if (!canonical) return null;
  target.pathname = canonical;
  const response = new Response(null, { status: 308, headers: { Location: target.toString() } });
  applyBaseSecurityHeaders(response.headers);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-EKODI-Route', 'admin-canonical-handoff');
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

function redirectFormerMallPath(request) {
  const target = new URL(request.url);
  target.pathname = `${MALL_PREFIX}${target.pathname.slice(FORMER_MALL_PREFIX.length)}`;
  const response = new Response(null, { status: 308, headers: { Location: target.toString() } });
  applyBaseSecurityHeaders(response.headers);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-EKODI-Route', 'mall-former-canonical-redirect');
  return response;
}

function redirectRootMallAdminPath(request) {
  const target = new URL(request.url);
  target.pathname = `${MALL_PREFIX}${target.pathname.slice(MALL_ROOT_ALIAS_PREFIX.length)}`;
  const response = new Response(null, { status: 308, headers: { Location: target.toString() } });
  applyBaseSecurityHeaders(response.headers);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-EKODI-Route', 'mall-root-admin-canonical-redirect');
  return response;
}

function mallUpstreamPath(pathname, publicPrefix = MALL_PREFIX) {
  const suffix = pathname.slice(publicPrefix.length);
  return suffix || '/';
}

function rewriteMallHtmlDocument(html, pathname = MALL_PREFIX, publicPrefix = MALL_PREFIX) {
  let rewritten = String(html || '');
  if (publicPrefix !== MALL_PREFIX) rewritten = rewritten.split(MALL_PREFIX).join(publicPrefix);
  const prefixGuard = publicPrefix === MALL_ROOT_ALIAS_PREFIX ? 'ekodimall' : 'ekodibiz\\/ekodimall';
  const rootAssetPattern = new RegExp(`\\b(href|src|action)=("|')\\/(?!\\/|${prefixGuard}(?:\\/|["']))([^"']*)\\2`, 'gi');
  rewritten = rewritten.replace(
    rootAssetPattern,
    (_, attribute, quote, suffix) => `${attribute}=${quote}${publicPrefix}/${suffix}${quote}`,
  );
  const canonical = `https://${PUBLIC_HOST}${pathname || publicPrefix}`;
  const canonicalTag = `<link rel="canonical" href="${canonical}">`;
  const canonicalPattern = /<link\b[^>]*\brel=(['"])canonical\1[^>]*>/i;
  rewritten = canonicalPattern.test(rewritten)
    ? rewritten.replace(canonicalPattern, canonicalTag)
    : rewritten.replace('</head>', `${canonicalTag}\n</head>`);
  return rewritten;
}
async function proxyMallService(request, publicPrefix = MALL_PREFIX) {
  const incoming = new URL(request.url);
  const upstream = new URL(request.url);
  upstream.protocol = 'https:';
  upstream.hostname = MALL_ORIGIN_HOST;
  upstream.port = '';
  upstream.pathname = mallUpstreamPath(incoming.pathname, publicPrefix);

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
        redirect.pathname = redirect.pathname === '/' ? publicPrefix : `${publicPrefix}${redirect.pathname}`;
        headers.set('location', redirect.toString());
      }
    } catch {}
  }
  let responseBody = upstreamResponse.body;
  if ((headers.get('content-type') || '').toLowerCase().includes('text/html')) {
    responseBody = rewriteMallHtmlDocument(await upstreamResponse.text(), incoming.pathname, publicPrefix);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
  }
  headers.set('x-ekodi-edge', 'mall-path-gateway');
  headers.set('x-ekodi-service', 'mall');
  const adminSurface = incoming.pathname === `${publicPrefix}/admin` || incoming.pathname.startsWith(`${publicPrefix}/admin/`);
  const apiSurface = incoming.pathname === `${publicPrefix}/api` || incoming.pathname.startsWith(`${publicPrefix}/api/`);
  const verificationOpsSurface = isMallVerificationOpsPath(incoming.pathname, publicPrefix);
  const adminEmbed = incoming.searchParams.get('embed') === 'admin';
  const cacheControl = adminSurface || apiSurface || verificationOpsSurface || adminEmbed ? 'no-store' : 'public, max-age=0, must-revalidate';
  const route = adminSurface ? 'admin-mall-proxy' : apiSurface ? 'mall-api-proxy' : verificationOpsSurface ? 'mall-verification-ops' : 'public-ekodi-mall';
  const mallCsp = adminEmbed ? MALL_ADMIN_EMBED_CSP : MALL_CSP;
  const response = withHostSecurity(new Response(responseBody, { status: upstreamResponse.status, statusText: upstreamResponse.statusText, headers }), mallCsp, cacheControl, route);
  if (adminSurface || apiSurface || verificationOpsSurface || adminEmbed) response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (adminEmbed) response.headers.delete('X-Frame-Options');
  const shelled = injectEkodiShell(response, 'mall', adminSurface ? 'admin' : 'public');
  if (adminSurface || apiSurface || verificationOpsSurface || adminEmbed) return shelled;
  return decorateDiscoveryResponse(shelled, incoming.pathname);
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
  const target = new URL('https://ekodi.kr/auth/');
  target.searchParams.set('site', 'admin');
  target.searchParams.set('direct', '1');
  target.searchParams.set('return_to', safePath === '/' ? 'https://ekodi.kr/admin/' : `https://ekodi.kr/admin${safePath}`);
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
  const target = new URL('https://ekodi.kr/auth/');
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

async function proxyPublicAi(request, env) {
  if (!env.AI?.fetch) return new Response('AI service unavailable',{status:503,headers:{'cache-control':'no-store'}});
  const sourceUrl=new URL(request.url);
  const target=new URL(request.url);
  target.pathname=sourceUrl.pathname.replace(/^\/ai(?=\/|$)/,'')||'/';
  const headers=new Headers(request.headers);
  headers.set('x-ekodi-public-ai','commons-v1');
  const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
  const upstream=await env.AI.fetch(new Request(target.toString(),{method:request.method,headers,body,redirect:'manual'}));
  const response=new Response(upstream.body,upstream);
  response.headers.set('X-EKODI-AI-Entry','commons-v1');
  return response;
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

async function proxyAdminPersonalFinance(request, env) {
  if (!env.PERSONAL_FINANCE?.fetch) {
    return withHostSecurity(new Response(JSON.stringify({error:'Personal Finance service binding unavailable',code:'PERSONAL_FINANCE_BINDING_UNAVAILABLE'}), {
      status:503,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    }), ADMIN_CSP, 'no-store', 'admin-personal-finance-proxy');
  }
  const target = new URL(request.url);
  target.pathname = '/api/admin/personal-finance/control';
  target.search = '';
  const headers = new Headers(request.headers);
  headers.set('x-ekodi-admin-proxy', 'personal-finance-binding-v1');
  const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const upstream = await env.PERSONAL_FINANCE.fetch(new Request(target.toString(), {method:request.method,headers,body,redirect:'manual'}));
  if (upstream.status === 401) {
    const response = new Response(JSON.stringify({error:'EKODI 관리자 인증이 필요합니다.',code:'PF_ADMIN_AUTH_REQUIRED'}), {
      status:401,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    });
    response.headers.set('X-EKODI-Personal-Finance-Proxy', 'service-binding-v1');
    return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-personal-finance-proxy');
  }
  const response = new Response(upstream.body, upstream);
  response.headers.set('X-EKODI-Personal-Finance-Proxy', 'service-binding-v1');
  return withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-personal-finance-proxy');
}

async function proxyAdminCommonServiceAi(request, env) {
  const url = new URL(request.url);
  const suffix = url.pathname.slice(ADMIN_COMMON_SERVICE_AI_PREFIX.length);
  if (!/^(?:status|session|tasks(?:\/[a-z0-9._~-]+(?:\/(?:run|approve))?)?|nodes(?:\/pair)?)$/i.test(suffix)) {
    return withHostSecurity(new Response(JSON.stringify({error:'NOT_FOUND'}), {status:404,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}), ADMIN_CSP, 'no-store', 'admin-common-service-ai-proxy');
  }
  if (!env.AI?.fetch) return withHostSecurity(new Response(JSON.stringify({error:'AI_BINDING_UNAVAILABLE'}), {status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}), ADMIN_CSP, 'no-store', 'admin-common-service-ai-proxy');
  const target = new URL(request.url);
  target.pathname = '/api/' + suffix;
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.set('x-ekodi-admin-proxy', 'common-service-binding-v2');
  const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const upstream = await env.AI.fetch(new Request(target.toString(), {method:request.method,headers,body,redirect:'manual'}));
  const response = new Response(upstream.body, upstream);
  response.headers.set('X-EKODI-Common-Service-Proxy', 'ai-service-binding-v2');
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
      const target = new URL('https://ekodi.kr/admin/');
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
        const target = new URL('https://ekodi.kr/auth/oauth/consent');
        target.search = url.search;
        const response = new Response(null, { status:307, headers:{ Location:target.toString(), 'Cache-Control':'no-store' } });
        applyBaseSecurityHeaders(response.headers);
        return response;
      }
      if (['GET','HEAD'].includes(request.method) && (url.pathname === '/connect' || url.pathname === '/connect/')) {
        const target = new URL('/auth/', request.url);
        target.searchParams.set('site','ai');
        target.searchParams.set('return_to','https://ekodi.kr/ai/');
        target.searchParams.set('source','mcp-connect');
        const response = new Response(null,{status:302,headers:{location:target.toString(),'cache-control':'no-store'}});
        applyBaseSecurityHeaders(response.headers);
        response.headers.set('X-EKODI-Route','mcp-connect-auth');
        response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
        return response;
      }
      if (url.pathname === '/ai') {
        const target = new URL(request.url);
        target.pathname = '/ai/';
        const response = new Response(null, {status:308, headers:{location:target.toString(),'cache-control':'no-store'}});
        applyBaseSecurityHeaders(response.headers);
        response.headers.set('X-EKODI-AI-Canonical','/ai/');
        return response;
      }
      if (url.pathname.startsWith('/ai/')) return proxyPublicAi(request, env);
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const response = await env.ASSETS.fetch(assetRequest(request, '/'));
        return withHostSecurity(response, PUBLIC_CSP, 'no-store', 'public-home');
      }
      if (['GET','HEAD'].includes(request.method) && (url.pathname === '/pizzamaru/mokpodae' || url.pathname === '/pizzamaru/mokpodae/')) {
        const target=new URL('/pizzamaru',request.url);target.search=url.search;
        return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-canonical-storefront':'pizzamaru'}});
      }
      if (url.pathname === '/tenant-admin-command-home.css') return tenantAdminCommandHomeCss();
      if (url.pathname === '/tenant-admin-command-home.js') return tenantAdminCommandHomeScript();
      if (url.pathname === '/tenant-live-admin.css') return tenantLiveAdminCss();
      if (url.pathname === '/tenant-live-admin.js') return tenantLiveAdminScript();
      if (url.pathname === '/workspace-admin.css') return workspaceAdminCss();
      if (url.pathname === '/workspace-admin.js') return workspaceAdminScript();
      if (url.pathname.startsWith('/api/control/storage/google/cheonggye-members')) return proxyAdminStorage(request, env);
      if (url.pathname === ADMIN_PERSONAL_FINANCE_PATH) return proxyAdminPersonalFinance(request, env);
      if (url.pathname === '/church-pastor-admin.js') return churchPastorAdminScript();
      const workspaceAdminAsset = WORKSPACE_ADMIN_ASSET_ALIASES.get(url.pathname);
      if (workspaceAdminAsset) {
        const response = await env.ASSETS.fetch(assetRequest(request, workspaceAdminAsset));
        return withHostSecurity(response, ADMIN_CSP, adminAssetCacheControl(url), 'admin-workspace-asset');
      }
      if (['GET','HEAD'].includes(request.method) && isEkodiBizInvestAdminPath(url.pathname)) {
        const page=ekodiBizInvestAdminPage(request);
        const secured=withHostSecurity(page, ADMIN_CSP, 'no-store', 'public-ekodibiz-invest-admin');
        return injectEkodiShell(secured, 'biz', 'admin');
      }
      const liveAdminTenant = realtimeTenantAdminFromPath(url.pathname);
      if (['GET','HEAD'].includes(request.method) && liveAdminTenant) return withHostSecurity(tenantLiveAdminPage(liveAdminTenant), LIVE_CSP, 'no-store', 'tenant-'+liveAdminTenant.apiTenant+'-live-admin');
      const liveTenant = realtimeTenantFromPath(url.pathname);
      if (['GET','HEAD'].includes(request.method) && liveTenant && !liveTenant.dedicated) return withHostSecurity(tenantLivePage(liveTenant), LIVE_CSP, 'no-store', 'public-'+liveTenant.apiTenant+'-live');
      if (isLegacyEkodiBizPath(url.pathname)) return redirectLegacyEkodiBizPath(request);
      if (['GET','HEAD'].includes(request.method)) { const adminAlias=redirectLegacyAdminAliasPath(request); if (adminAlias) return adminAlias; }
      if (isLegacyMallPath(url.pathname)) return redirectLegacyMallPath(request);
      if (isFormerMallPath(url.pathname)) return redirectFormerMallPath(request);
      if (isRootMallAdminPath(url.pathname)) return redirectRootMallAdminPath(request);
      if (isRootMallPath(url.pathname)) return proxyMallService(request, MALL_ROOT_ALIAS_PREFIX);
      if (['GET','HEAD'].includes(request.method) && (url.pathname === '/ekodi-church' || url.pathname.startsWith('/ekodi-church/'))) { const target=new URL(request.url); target.pathname=url.pathname.replace(/^\/ekodi-church(?=\/|$)/i,'/ekodichurch'); return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff'}}); }
      if (['GET','HEAD'].includes(request.method) && isChurchPastorAdminPath(url.pathname)) return injectEkodiShell(churchPastorAdminPage(), 'church', 'admin');
      if (isWorkspaceAdminPath(url.pathname)) return injectEkodiShell(workspaceAdminPage(), 'space', 'admin');
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
      if (url.pathname === ADMIN_PERSONAL_FINANCE_PATH) return proxyAdminPersonalFinance(request, env);
      if (url.pathname.startsWith(ADMIN_MARKETING_PUBLISHING_PREFIX)) return proxyAdminMarketingPublishing(request);
      if (url.pathname.startsWith(ADMIN_COMMON_SERVICE_AI_PREFIX)) return proxyAdminCommonServiceAi(request, env);
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

    if (HUB_HOSTS.has(host) && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/hub'));
      return withHostSecurity(response, HUB_CSP, 'public, max-age=300', 'hub');
    }

    return env.ASSETS.fetch(request);
  },
};
