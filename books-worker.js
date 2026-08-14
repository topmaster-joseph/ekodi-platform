export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'ekodi-books', socialRegistry: true }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
      return Response.redirect('https://admin.ekodi.kr/books#books', 307);
    }
    return env.ASSETS.fetch(request);
  },
};
