import { injectEkodiShell } from './ekodi-shell-injector.js';
import { handleCommerce } from './books-commerce.js';

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'ekodi-books', bookstore: true, directCommerce: Boolean(env.DB), publishingNetwork: true, publishingService: 'https://ekodi.kr/publishing/' }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    // BOOKS-DIRECT-COMMERCE-001: 에코디서점 자체 판매 API (주문·결제승인·내 서재·다운로드)
    if (url.pathname === '/api/commerce' || url.pathname.startsWith('/api/commerce/')) {
      return handleCommerce(request, env);
    }
    if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
      return Response.redirect('https://ekodi.kr/admin/books#books', 307);
    }
    if (url.pathname === '/publishing' || url.pathname === '/publishing/') {
      return Response.redirect('https://ekodi.kr/publishing/', 308);
    }
    if (url.pathname.startsWith('/publishing/studio')) {
      return Response.redirect('https://ekodi.kr/publishing/studio/', 308);
    }
    if (url.pathname.startsWith('/publishing/upaper')) {
      return Response.redirect('https://ekodi.kr/publishing/upaper/', 308);
    }
    if (/^\/store\/[^/]+\/?$/.test(url.pathname)) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/store/'));
      return injectEkodiShell(response, 'books');
    }
    return injectEkodiShell(await env.ASSETS.fetch(request), 'books');
  },
};