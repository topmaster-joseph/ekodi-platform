import { injectEkodiShell } from './ekodi-shell-injector.js';

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'ekodi-books', socialRegistry: true, publishingNetwork: true }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
      return Response.redirect('https://admin.ekodi.kr/books#books', 307);
    }
    if (/^\/store\/[^/]+\/?$/.test(url.pathname)) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/store/'));
      return injectEkodiShell(response, 'books');
    }
    return injectEkodiShell(await env.ASSETS.fetch(request), 'books');
  },
};
