import { isPublicWorkspacePath, workspaceSlugFromPublicPath } from './workspace-route-policy.js';

const DEFAULT_PAGE_PROFILE=Object.freeze({
  documentTitle:'운영공간 · EKODI',name:'내 운영공간',kicker:'OPERATING SPACE',
  lead:'로그인 후 내가 운영하거나 참여하는 점포와 조직만 표시합니다.',theme:'default',
  description:'EKODI 점포 운영공간'
});
const STORE_PAGE_PROFILES=Object.freeze({
  jadam:{documentTitle:'자담치킨 목포대점 · EKODI',name:'자담치킨 목포대점',kicker:'CHICKEN STORE USER PAGE',lead:'치킨 메뉴·가격·배달채널을 자담치킨 데이터로만 분리해 운영합니다.',theme:'jadam',description:'자담치킨 목포대점 사용자 운영페이지'},
  pizzamaru:{documentTitle:'피자마루 목포대점 · EKODI',name:'피자마루 목포대점',kicker:'PIZZA STORE USER PAGE',lead:'피자 메뉴·옵션·판매가·배달채널을 피자마루 데이터로만 분리해 운영합니다.',theme:'pizzamaru',description:'피자마루 목포대점 사용자 운영페이지'},
  yogurt:{documentTitle:'요거트퍼플 목포대점 · EKODI',name:'요거트퍼플 목포대점',kicker:'YOGURT DESSERT USER PAGE',lead:'요거트·디저트 메뉴·옵션·판매가·배달채널을 요거트퍼플 데이터로만 분리해 운영합니다.',theme:'yogurt',description:'요거트퍼플 목포대점 사용자 운영페이지'},
});
function staticPageProfile(pathname){const slug=workspaceSlugFromPublicPath(pathname);return STORE_PAGE_PROFILES[slug]||DEFAULT_PAGE_PROFILE}
async function pageProfile(pathname,env){
  const slug=workspaceSlugFromPublicPath(pathname);
  const fallback=staticPageProfile(pathname);
  if(!slug||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return {profile:fallback,canonicalSlug:slug,status:'active',source:'static'};
  try{
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_user_site_public_profile`,{
      method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})
    });
    if(!response.ok)return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback'};
    const data=await response.json().catch(()=>null);
    if(!data||typeof data!=='object')return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback'};
    return {profile:{documentTitle:data.document_title||`${data.name||fallback.name} · EKODI`,name:data.name||fallback.name,kicker:data.kicker||fallback.kicker,lead:data.lead||fallback.lead,theme:data.theme||fallback.theme,description:data.description||fallback.description},canonicalSlug:data.canonical_slug||slug,status:data.status||'active',source:'store-user-sites'};
  }catch{return {profile:fallback,canonicalSlug:slug,status:'active',source:'fallback'}}
}
function htmlText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}

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
  return {dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',workspaceApi:dataEnabled?`${env.SUPABASE_URL}/functions/v1/workspace-api`:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=space',canonicalOrigin:'https://ekodi.kr',routeModel:'/{slug}',identityModel:'ekodi_id -> workspace_id -> role -> capability'};
}
function authRedirect(request,env){
  const current=new URL(request.url);current.hash='';
  const canonical=new URL(current.pathname+current.search,'https://ekodi.kr');
  const target=new URL(env.AUTH_URL||'https://auth.ekodi.kr/?site=space');
  target.searchParams.set('site','space');target.searchParams.set('return_to',canonical.href);
  return withHeaders(env,Response.redirect(target.href,302),'auth-start');
}
async function appShell(request,env,route='space-home',profile=DEFAULT_PAGE_PROFILE){
  const target=new URL(request.url);target.pathname='/';target.search='';target.hash='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  const contentType=asset.headers.get('content-type')||'';
  if(!contentType.includes('text/html'))return withHeaders(env,asset,route);
  let html=await asset.text();
  const tokens={
    '__SPACE_PAGE_DOCUMENT_TITLE__':profile.documentTitle,
    '__SPACE_PAGE_NAME__':profile.name,
    '__SPACE_PAGE_KICKER__':profile.kicker,
    '__SPACE_PAGE_LEAD__':profile.lead,
    '__SPACE_PAGE_THEME__':profile.theme,
    '__SPACE_PAGE_DESCRIPTION__':profile.description,
  };
  for(const [token,value] of Object.entries(tokens))html=html.replaceAll(token,htmlText(value));
  const headers=new Headers(asset.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return withHeaders(env,new Response(html,{status:asset.status,statusText:asset.statusText,headers}),route);
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const legacyAlias=url.hostname.toLowerCase()==='space.ekodi.kr';
    const canonicalRedirect=()=>{
      const target=new URL(url.pathname+url.search,'https://ekodi.kr');
      return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-legacy-alias':'space.ekodi.kr'}});
    };
    if(url.pathname==='/health')return json(env,{ok:true,service:'ekodi-space',product:'operating-space',identity:'ekodi-id',workspaceIdentity:'workspace-id',routeModel:['root-slug'],dataEnabled:runtimeConfig(env).dataEnabled,dataMode:runtimeConfig(env).dataMode});
    if(url.pathname==='/config.js')return withHeaders(env,new Response(`window.EKODI_SPACE_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}}),'config');
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=workspace&source=space.ekodi.kr',307);
    if(url.pathname==='/auth/start'){
      if(!['GET','HEAD'].includes(request.method))return json(env,{error:'method_not_allowed'},405);
      return authRedirect(request,env);
    }
    if(url.pathname==='/yogurtpurple'||url.pathname==='/yogurtpurple/'){
      const target=new URL('/yogurt'+url.search,'https://ekodi.kr');
      return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-alias':'yogurtpurple->yogurt'}});
    }
    if(legacyAlias&&(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html'))return new Response(null,{status:308,headers:{location:'https://my.ekodi.kr/','cache-control':'no-store','x-ekodi-legacy-alias':'space.ekodi.kr'}});
    if(url.pathname==='/'||url.pathname===''||url.pathname==='/index.html')return appShell(request,env,'space-home');
    if(isPublicWorkspacePath(url.pathname)){
      if(legacyAlias&&url.pathname!=='/deployment-probe')return canonicalRedirect();
      const resolved=await pageProfile(url.pathname,env);
      const requested=workspaceSlugFromPublicPath(url.pathname);
      if(resolved.canonicalSlug&&requested&&resolved.canonicalSlug!==requested){
        const target=new URL(`/${resolved.canonicalSlug}${url.search}`,'https://ekodi.kr');
        return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-workspace-alias':`${requested}->${resolved.canonicalSlug}`}});
      }
      if(resolved.status==='paused')return withHeaders(env,new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>사용자 사이트 일시중지 · EKODI</title><body><main><h1>사용자 사이트가 일시중지되었습니다.</h1><p>운영공간 관리자 설정에서 다시 활성화할 수 있습니다.</p></main></body></html>',{status:404,headers:{'content-type':'text/html; charset=utf-8'}}),'space-paused');
      return appShell(request,env,'space-workspace',resolved.profile);
    }
    return withHeaders(env,await env.ASSETS.fetch(request),'space-asset');
  }
};
