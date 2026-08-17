const CSP = [
  "default-src 'self'",
  "style-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://js.tosspayments.com",
  "connect-src 'self' https://api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co wss://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net https://*.tosspayments.com",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "frame-src https://*.tosspayments.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://auth.ekodi.kr https://*.tosspayments.com",
  "object-src 'none'",
].join('; ');

function secure(response, cache = 'public, max-age=120') {
  const next = new Response(response.body, response);
  next.headers.set('Content-Security-Policy', CSP);
  next.headers.set('Referrer-Policy', 'no-referrer');
  next.headers.set('X-Content-Type-Options', 'nosniff');
  next.headers.set('X-Frame-Options', 'DENY');
  next.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next.headers.set('Cache-Control', cache);
  next.headers.set('X-EKODI-Service', 'author-ai');
  next.headers.set('X-EKODI-Product', 'creator-ai');
  return next;
}

async function authorHtml(response) {
  if (!response.ok) return secure(response, 'no-store');
  const contentType = String(response.headers.get('content-type') || '');
  if (!contentType.includes('text/html')) return secure(response, 'no-store');
  let html = await response.text();
  if (!html.includes('/billing.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/billing.css">\n</head>');
  if (!html.includes('/billing.js')) html = html.replace('</body>', '<script type="module" src="/billing.js"></script>\n</body>');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return secure(new Response(html, { status:response.status, statusText:response.statusText, headers }), 'no-store');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'ekodi-author-ai',
        product: 'ekodi-creator-ai',
        compatibilityServiceKey: 'author',
        workflow: 'idea-plan-creating-review-creator-approved-ready-to-share',
        creatorModes: ['writer','video','podcast','lecture','research','visual','mission','ai'],
        chiefAiProtocol: 'author-events-v1',
        myEkodiPortfolio: true,
        booksHandoff: true,
        paidAiBilling: 'server-verified',
      }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-ekodi-service': 'author-ai',
          'x-ekodi-product': 'creator-ai',
        },
      });
    }
    if (url.pathname === '/books' || url.pathname === '/books/') return Response.redirect('https://books.ekodi.kr/', 307);
    if (url.pathname === '/my' || url.pathname === '/my/') return Response.redirect('https://my.ekodi.kr/', 307);
    if (url.pathname === '/community' || url.pathname === '/community/') return Response.redirect('https://community.ekodi.kr/', 307);
    const response = await env.ASSETS.fetch(request);
    if (url.pathname === '/' || url.pathname === '/index.html') return authorHtml(response);
    return secure(response, 'public, max-age=300');
  },
};
