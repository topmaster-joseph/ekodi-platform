import { searchVerificationFileResponse } from './search-engine-verification.js';

const CANONICAL = Object.freeze({
  'ekodichurch.kr': 'https://ekodi.kr/ekodichurch',
  'ekodilab.kr': 'https://ekodi.kr/ekodilab',
  'ekodimall.kr': 'https://ekodi.kr/ekodimall'
});

// The owner-supplied 2026-10-30 church verification URL must respond on
// ekodichurch.kr itself, before the existing permanent path redirect.
export const EKODICHURCH_NAVER_FILE_PATH = '/naver85321326d5553a0caa3a944158fc2969.html';

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

    if (!CANONICAL[incoming.hostname] && !PATH_PREFIX_ALIASES[incoming.hostname]) {
      return new Response('Not found', { status: 404 });
    }
    // Search-engine ownership files must answer 200 at the legacy domain's own root,
    // not via a redirect to another host (Naver Search Advisor HTML file method).
    if (request.method === 'GET' || request.method === 'HEAD') {
      const verificationFile = searchVerificationFileResponse(incoming.pathname, { head: request.method === 'HEAD' });
      if (incoming.hostname === 'ekodichurch.kr' &&
          incoming.pathname === EKODICHURCH_NAVER_FILE_PATH) {
        if (!verificationFile) return new Response('Not found', { status: 404 });
        return verificationFile;
      }
      if (verificationFile) return verificationFile;
    }
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
    // Preserve the canonical first-party service prefix on every redirect.
    target.pathname = prefixedPath(target.pathname, incoming.pathname);
    target.search = incoming.search;
    target.hash = incoming.hash;
    return Response.redirect(target.toString(), 301);
  }
};
