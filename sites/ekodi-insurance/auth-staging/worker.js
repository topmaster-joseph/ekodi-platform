const BLOCKED_PRODUCTION_REF='renzehysxirjilvdxacv';
const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy':'same-origin-allow-popups',
  'content-security-policy':"default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://*.supabase.co; img-src 'self' data: https://*.gstatic.com https://*.googleusercontent.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function headers(extra={}){return{...SECURITY_HEADERS,...extra};}
function config(env){
  const supabaseUrl=String(env.INSURANCE_STAGING_SUPABASE_URL||'');
  const publishableKey=String(env.INSURANCE_STAGING_PUBLISHABLE_KEY||'');
  const googleClientId=String(env.INSURANCE_STAGING_GOOGLE_CLIENT_ID||'');
  const identityUrl=String(env.INSURANCE_STAGING_IDENTITY_URL||'');
  const returnUrl=String(env.INSURANCE_STAGING_RETURN_URL||'');
  const complete=[supabaseUrl,publishableKey,googleClientId,identityUrl,returnUrl].every(Boolean);
  const productionLeak=[supabaseUrl,identityUrl].some(v=>v.includes(BLOCKED_PRODUCTION_REF));
  return complete&&!productionLeak?{environment:'staging',supabaseUrl,publishableKey,googleClientId,identityUrl,returnUrl}:{environment:'blocked',supabaseUrl:'',publishableKey:'',googleClientId:'',identityUrl:'',returnUrl:''};
}
function secure(response){const h=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))h.set(k,v);if(!h.has('cache-control'))h.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-store':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});}
export default{
  async fetch(request,env){
    const url=new URL(request.url),cfg=config(env);
    if(url.pathname==='/health')return new Response(JSON.stringify({ok:true,service:'ekodi-insurance-auth-staging',environment:cfg.environment,productionProjectBlocked:true,issuesSession:false}),{headers:headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'})});
    if(url.pathname==='/config.js')return new Response(`window.EKODI_INSURANCE_AUTH=${JSON.stringify(cfg)};`,{headers:headers({'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'})});
    return secure(await env.ASSETS.fetch(request));
  }
};
