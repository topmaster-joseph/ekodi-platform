// The legacy brand domain leads to the apex-path service; never to retired subdomains.
// Keep authentication/payment service bindings independent from this redirect.
const TARGET = 'https://ekodi.kr/ekodibiz';
const CANONICAL_SITEMAP = 'https://ekodi.kr/sitemap.xml';
const ALLOWED_HOSTS = new Set(['ekodibiz.kr', 'www.ekodibiz.kr']);

// Naver Search Advisor file issued by the owner for the apex host ekodibiz.kr.
// Never redirect this exact verification URL to ekodi.kr or expose it on www.
export const EKODIBIZ_NAVER_FILE_PATH = '/naverf72bebc155107dcad735d8178146679f.html';
export const EKODIBIZ_NAVER_FILE_BODY = 'naver-site-verification: naverf72bebc155107dcad735d8178146679f.html';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!ALLOWED_HOSTS.has(incoming.hostname)) {
      return new Response('Not found', { status: 404 });
    }
    if (incoming.hostname === 'ekodibiz.kr' &&
        incoming.pathname === EKODIBIZ_NAVER_FILE_PATH &&
        (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(request.method === 'HEAD' ? null : EKODIBIZ_NAVER_FILE_BODY, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'x-ekodi-route': 'ekodibiz-naver-ownership',
        },
      });
    }

    // Keep historical sitemap requests away from the nonexistent
    // /ekodibiz/sitemap.xml path. The apex public registry owns discovery.
    if (incoming.pathname === '/sitemap.xml') {
      return Response.redirect(CANONICAL_SITEMAP, 301);
    }
    if (incoming.pathname === '/robots.txt' &&
        (request.method === 'GET' || request.method === 'HEAD')) {
      const body = 'User-agent: *\nAllow: /\nSitemap: ' + CANONICAL_SITEMAP + '\n';
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'x-ekodi-route': 'ekodibiz-legacy-robots',
        },
      });
    }

    const target = new URL(TARGET);
    const suffix = incoming.pathname === '/' ? '' : incoming.pathname;
    target.pathname = `${target.pathname.replace(/\/$/, '')}${suffix}`;
    target.search = incoming.search;
    return Response.redirect(target.toString(), 301);
  }
};
