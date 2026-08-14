const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://api.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function enhanceHtml(response){
  if(!response.headers.get('content-type')?.includes('text/html'))return response;
  return new HTMLRewriter()
    .on('body',{element(el){el.append('<script src="/social-links.js" defer></script>',{html:true})}})
    .transform(response);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return new Response(JSON.stringify({ok:true,service:'ekodi-community',socialRegistry:true}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/community',307);
    const response=enhanceHtml(await env.ASSETS.fetch(request));
    return withHeaders(response);
  }
};
