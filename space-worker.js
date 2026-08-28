const SPACE_ROUTE=/^\/(personal|org|group|project)\/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)\/?$/;

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net'];
  if(env.SUPABASE_URL){try{connect.push(new URL(env.SUPABASE_URL).origin)}catch{}}
  return {
    'content-security-policy':`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src ${connect.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), usb=()',
    'x-ekodi-service':'space',
  };
}
function withHeaders(env,response,route='asset'){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);
  headers.set('x-ekodi-route',route);
  const contentType=headers.get('content-type')||'';
  if(contentType.includes('text/html')){
    headers.set('cache-control','no-store');
    headers.set('x-robots-tag','noindex, nofollow, noarchive');
  }else if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function json(env,data,status=200){return withHeaders(env,new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}),'api')}
function runtimeConfig(env){
  const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);
  return {dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',workspaceApi:dataEnabled?`${env.SUPABASE_URL}/functions/v1/workspace-api`:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=space',canonicalOrigin:'https://space.ekodi.kr',routeModel:'/personal/{slug} | /org/{slug} | /group/{slug} | /project/{slug}',identityModel:'ekodi_id -> workspace_id -> role -> capability'};
}
function authRedirect(request,env){
  const current=new URL(request.url);current.hash='';
  const canonical=new URL(current.pathname+current.search,'https://space.ekodi.kr');
  const target=new URL(env.AUTH_URL||'https://auth.ekodi.kr/?site=space');
  target.searchParams.set('site','space');target.searchParams.set('return_to',canonical.href);
  return withHeaders(env,Response.redirect(target.href,302),'auth-start');
}
async function appShell(request,env,route='space-home'){
  const target=new URL(request.url);target.pathname='/';target.search='';target.hash='';
  return withHeaders(env,await env.ASSETS.fetch(new Request(target.toString(),request)),route);
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return json(env,{ok:true,service:'ekodi-space',product:'operating-space',identity:'ekodi-id',workspaceIdentity:'workspace-id',routeModel:['personal','org','group','project'],dataEnabled:runtimeConfig(env).dataEnabled,dataMode:runtimeConfig(env).dataMode});
    if(url.pathname==='/config.js')return withHeaders(env,new Response(`window.EKODI_SPACE_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}}),'config');
    if(url.pathname==='/auth/start'){
      if(!['GET','HEAD'].includes(request.method))return json(env,{error:'method_not_allowed'},405);
      return authRedirect(request,env);
    }
    if(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html')return appShell(request,env,'space-home');
    if(SPACE_ROUTE.test(url.pathname))return appShell(request,env,'space-workspace');
    if(/^\/(personal|org|group|project)\//.test(url.pathname))return json(env,{error:'space_route_not_found'},404);
    return withHeaders(env,await env.ASSETS.fetch(request),'space-asset');
  }
};
