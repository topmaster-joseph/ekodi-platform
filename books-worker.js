import { injectEkodiShell } from './ekodi-shell-injector.js';
import { handleCommerce } from './books-commerce.js';

// BOOKS-COMMERCE-CSP-001: 공용 셸의 기본 CSP(script-src 'self')는 구글 로그인·토스 결제 스크립트를 막는다.
// 구매·내 서재 화면에는 필요한 외부 출처만 명시한 CSP를 먼저 정해 두고, 셸은 그 위에 자기 출처만 더한다.
export const COMMERCE_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client https://js.tosspayments.com https://*.tosspayments.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://accounts.google.com/gsi/ https://*.tosspayments.com",
  "frame-src https://accounts.google.com/gsi/ https://accounts.google.com/ https://*.tosspayments.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.tosspayments.com",
  "object-src 'none'",
].join('; ');
export const isCommercePage = (pathname) => /^\/(?:buy|library|review)(?:\/|$)/.test(pathname);
function withCommerceCsp(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return response;
  const out = new Response(response.body, response);
  out.headers.set('content-security-policy', COMMERCE_CSP);
  return out;
}

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
    if (isCommercePage(url.pathname)) return injectEkodiShell(withCommerceCsp(await env.ASSETS.fetch(request)), 'books');
    return injectEkodiShell(await env.ASSETS.fetch(request), 'books');
  },
};