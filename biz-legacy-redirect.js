const TARGET = 'https://ekodi.kr/ekodibiz';
const ALLOWED_HOSTS = new Set(['ekodibiz.kr', 'www.ekodibiz.kr']);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!ALLOWED_HOSTS.has(incoming.hostname)) {
      return new Response('Not found', { status: 404 });
    }

    const target = new URL(TARGET);
    const basePath = target.pathname.replace(/\/$/, '');
    const suffix = incoming.pathname === '/' ? '' : incoming.pathname;
    target.pathname = `${basePath}${suffix}` || '/';
    target.search = incoming.search;
    target.hash = incoming.hash;
    return Response.redirect(target.toString(), 301);
  }
};
