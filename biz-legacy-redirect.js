const TARGET = 'https://biz.ekodi.kr';
const ALLOWED_HOSTS = new Set(['ekodibiz.kr', 'www.ekodibiz.kr']);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!ALLOWED_HOSTS.has(incoming.hostname)) {
      return new Response('Not found', { status: 404 });
    }

    const target = new URL(TARGET);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    target.hash = incoming.hash;
    return Response.redirect(target.toString(), 301);
  }
};
