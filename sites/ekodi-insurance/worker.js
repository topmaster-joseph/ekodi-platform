const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://insurance-api-staging.ekodi.kr https://insurance-api.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function withHeaders(response){
  const headers=new Headers(response.headers);
  for(const [k,v] of Object.entries(SECURITY_HEADERS))headers.set(k,v);
  if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-store':'public, max-age=300');
  return headers;
}
async function secureAsset(response){
  const headers=withHeaders(response);
  if(response.headers.get('content-type')?.includes('text/html')){
    let html=await response.text();
    if(!html.includes('/server-bridge.js')) html=html.replace('</head>','  <script src="/server-bridge.js" defer></script>\n</head>');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return new Response(JSON.stringify({
      ok:true,
      service:'ekodi-insurance',
      mode:'staging-cloudflare-d1-free',
      personalPolicyData:'browser-local',
      personalClaimData:'browser-local',
      consultationStorage:'encrypted-d1-on-explicit-handoff',
      privacyCenter:true,
      productRecommendation:false,
      aiChat:true,
      humanHandoffQueue:true,
      adminQueue:true,
      externalAiProvider:false
    }),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect(new URL('/admin.html',url).toString(),302);
    return secureAsset(await env.ASSETS.fetch(request));
  }
};
