import { injectEkodiShell, shellServiceForHost } from './ekodi-shell-injector.js';

const ORIGINS = Object.freeze({});

const MAIL_CANONICAL = 'https://mail.ekodi.kr';
const MALL_CANONICAL = 'https://ekodi.kr/ekodimall';
const BIZ_CANONICAL = 'https://ekodi.kr/ekodibiz';
const CANONICAL_REDIRECTS = Object.freeze({
  // biz.ekodi.kr is retired; EKODIBIZ is served only at ekodi.kr/ekodibiz.
  'biz.ekodi.kr': BIZ_CANONICAL,
  'mall.ekodi.kr': MALL_CANONICAL,
  'mall.biz.ekodi.kr': MALL_CANONICAL,
  'mail.biz.ekodi.kr': MAIL_CANONICAL,
  'mail.church.ekodi.kr': MAIL_CANONICAL,
  'mail.lab.ekodi.kr': MAIL_CANONICAL,
  'mail.books.ekodi.kr': MAIL_CANONICAL,
  'mail.trade.ekodi.kr': MAIL_CANONICAL
});

const REDIRECTS = Object.freeze({
  'live.church.ekodi.kr': 'https://www.youtube.com/@ekodichurch/live'
});

const STAGING_HOSTS = new Set([...Object.keys(ORIGINS), ...Object.keys(REDIRECTS), ...Object.keys(CANONICAL_REDIRECTS)]);
function requestHost(request, env, incoming) {
  if (env?.ENVIRONMENT !== 'staging') return incoming.hostname;
  const requested = String(request.headers.get('x-ekodi-staging-host') || '').trim().toLowerCase();
  return STAGING_HOSTS.has(requested) ? requested : incoming.hostname;
}

export default {
  async fetch(request, env = {}) {
    const incoming = new URL(request.url);
    const host = requestHost(request, env, incoming);

    const canonicalBase = CANONICAL_REDIRECTS[host];
    if (canonicalBase) {
      const target = new URL(canonicalBase);
      const suffix = incoming.pathname === '/' ? '' : incoming.pathname;
      target.pathname = `${target.pathname.replace(/\/$/, '')}${suffix}`;
      target.search = incoming.search;
      return Response.redirect(target.toString(), 308);
    }

    if (incoming.pathname === '/admin' || incoming.pathname === '/admin/') {
      const target = new URL('https://ekodi.kr/admin/');
      target.searchParams.set('source', host);
      return Response.redirect(target.toString(), 307);
    }

    const redirectTarget = REDIRECTS[host];
    if (redirectTarget) return Response.redirect(redirectTarget, 302);

    const originHost = ORIGINS[host];
    if (!originHost) return new Response('Not found', { status: 404 });

    const upstreamUrl = new URL(incoming);
    upstreamUrl.protocol = 'https:';
    upstreamUrl.hostname = originHost;
    upstreamUrl.port = '';

    const upstreamRequest = new Request(upstreamUrl, request);
    upstreamRequest.headers.delete('x-ekodi-staging-host');
    const upstreamResponse = await fetch(upstreamRequest);
    const headers = new Headers(upstreamResponse.headers);

    const location = headers.get('location');
    if (location) {
      try {
        const redirect = new URL(location, upstreamUrl);
        if (redirect.hostname === originHost) {
          redirect.hostname = host;
          redirect.protocol = 'https:';
          headers.set('location', redirect.toString());
        }
      } catch {
        // Preserve non-URL Location headers unchanged.
      }
    }

    headers.set('x-ekodi-edge', 'service-proxy');
    const response=new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers
    });
    return injectEkodiShell(response,shellServiceForHost(host));
  }
};