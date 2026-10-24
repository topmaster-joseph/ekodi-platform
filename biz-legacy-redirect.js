// The legacy brand domain leads to the apex-path service; never to retired subdomains.
// Keep authentication/payment service bindings independent from this redirect.
const TARGET = 'https://ekodi.kr/ekodibiz';
const ALLOWED_HOSTS = new Set(['ekodibiz.kr', 'www.ekodibiz.kr']);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!ALLOWED_HOSTS.has(incoming.hostname)) {
      return new Response('Not found', { status: 404 });
    }

    const target = new URL(TARGET);
    const suffix = incoming.pathname === '/' ? '' : incoming.pathname;
    target.pathname = `${target.pathname.replace(/\/$/, '')}${suffix}`;
    target.search = incoming.search;
    return Response.redirect(target.toString(), 301);
  }
};
