export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
      return Response.redirect('https://admin.ekodi.kr/books#books', 302);
    }
    return env.ASSETS.fetch(request);
  },
};
