import { injectEkodiShell } from './ekodi-shell-injector.js';

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net'];
  if(env.SUPABASE_URL){try{connect.push(new URL(env.SUPABASE_URL).origin)}catch{}}
  return {
    'content-security-policy':`default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src ${connect.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-ekodi-service':'my-ekodi',
  };
}
function json(env,data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}})}
function withHeaders(env,response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-store':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=my'}}
function personalBrandUrl(){const target='https://marketing.ekodi.kr/?mode=personal-brand&source=my';return `https://auth.ekodi.kr/?site=marketing&return_to=${encodeURIComponent(target)}`}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/config.js'){
      const cfg=runtimeConfig(env);
      return new Response(`window.EKODI_MY_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
    }
    if(url.pathname==='/health'){
      const cfg=runtimeConfig(env);
      return json(env,{ok:true,service:'ekodi-my',product:'my-ekodi',identity:'person-scoped',creatorPortfolio:true,personalBrandMarketing:true,ekodiShell:true,contextModel:'person-space-role',privacy:'private-first',dataMode:cfg.dataMode,dataEnabled:cfg.dataEnabled});
    }
    if(url.pathname==='/creator'||url.pathname==='/creator/')return Response.redirect('https://author.ekodi.kr/',307);
    if(url.pathname==='/personal-brand'||url.pathname==='/personal-brand/')return Response.redirect(personalBrandUrl(),307);
    const response=withHeaders(env,await env.ASSETS.fetch(request));
    return injectEkodiShell(response,'my');
  }
};