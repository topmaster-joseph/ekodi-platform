const CANONICAL = Object.freeze({
  'ekodibiz.kr': 'https://biz.ekodi.kr',
  'www.ekodibiz.kr': 'https://biz.ekodi.kr',
  'ekodichurch.kr': 'https://church.ekodi.kr',
  'ekodilab.kr': 'https://lab.ekodi.kr',
  'ekodimall.kr': 'https://mall.ekodi.kr'
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
