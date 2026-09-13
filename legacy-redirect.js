const CANONICAL = Object.freeze({
  'ekodichurch.kr': 'https://ekodi.kr/ekodichurch',
  'ekodilab.kr': 'https://ekodi.kr/ekodilab',
  'ekodimall.kr': 'https://ekodi.kr/ekodibiz/ekodimall'
});

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const base = CANONICAL[incoming.hostname];
    if (!base) return new Response('Not found', { status: 404 });

    const target = new URL(base);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    target.hash = incoming.hash;
    return Response.redirect(target.toString(), 301);
  }
};
