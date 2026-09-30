const CANONICAL = Object.freeze({
  'ekodichurch.kr': 'https://ekodi.kr/ekodichurch',
  'ekodilab.kr': 'https://ekodi.kr/ekodilab',
  'ekodimall.kr': 'https://ekodi.kr/ekodimall'
});

const PATH_PREFIX_ALIASES = Object.freeze({
  'seonammedi.kr': '/seonammedi',
  'xn--3e0b8b58jw4co4mnpll3k.kr': '/seonammedi'
});

function prefixedPath(prefix, pathname) {
  const path = pathname || '/';
  if (path === prefix || path.startsWith(prefix + '/')) return path;
  if (path === '/') return prefix + '/';
  return prefix + (path.startsWith('/') ? path : '/' + path);
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const prefix = PATH_PREFIX_ALIASES[incoming.hostname];

    if (prefix) {
      const target = new URL('https://ekodi.kr');
      target.pathname = prefixedPath(prefix, incoming.pathname);
      target.search = incoming.search;
      target.hash = incoming.hash;
      return Response.redirect(target.toString(), 301);
    }

    const base = CANONICAL[incoming.hostname];
    if (!base) return new Response('Not found', { status: 404 });

    const target = new URL(base);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    target.hash = incoming.hash;
    return Response.redirect(target.toString(), 301);
  }
};
