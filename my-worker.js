import { injectEkodiShell } from './ekodi-shell-injector.js';
import { EKODI_SERVICE_MANIFEST } from './ekodi-service-manifest.js';

const WORKSPACE_KEY_RE=/^[a-z]+:[a-zA-Z0-9:_-]+$/;
const SERVICE_ID_RE=/^[a-z][a-z0-9-]*$/;
const PRIVATE_ROUTER_TAG='<script src="/private-workspace-router.js?v=20260827-private-workspace-1"></script>';

function securityHeaders(env={}){
  const connect=["'self'",'https://cdn.jsdelivr.net','https://api.ekodi.kr'];
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
function withHeaders(env,response){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(env)))headers.set(key,value);
  const contentType=response.headers.get('content-type')||'';
  if(contentType.includes('text/html')){
    headers.set('cache-control','no-store');
    headers.set('x-robots-tag','noindex, nofollow, noarchive');
  }else if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function runtimeConfig(env){const dataEnabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);return{dataEnabled,dataMode:env.DATA_MODE||'isolated-staging',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:'',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=my'}}
function personalBrandUrl(){const target='https://marketing.ekodi.kr/?mode=personal-brand&source=my';return `https://auth.ekodi.kr/?site=marketing&return_to=${encodeURIComponent(target)}`}
function visibleServices(){return EKODI_SERVICE_MANIFEST.services.filter(service=>service.id!=='my'&&service.state!=='planned').sort((a,b)=>(a.order||999)-(b.order||999));}
function myServicePreamble(){
  const services=visibleServices();
  const serviceRows=services.map(service=>[service.id,service.name,service.url]);
  const openSso=services.filter(service=>service.openSso===true).map(service=>service.id);
  const sso=services.filter(service=>service.sso===true).map(service=>service.id);
  const targetable=services.filter(service=>service.targetable===true).map(service=>service.id);
  const priority=services.map(service=>service.id);
  return `const SERVICES=${JSON.stringify(serviceRows)};\nconst OPEN_SSO_SITES=new Set(${JSON.stringify(openSso)});\nconst SSO_SITES=new Set(${JSON.stringify(sso)});\nconst TARGETABLE_WORKSPACE_SITES=new Set(${JSON.stringify(targetable)});\nconst WORKSPACE_ENTRY_PRIORITY=${JSON.stringify(priority)};\nconst EKODI_SERVICE_MANIFEST_VERSION=${JSON.stringify(EKODI_SERVICE_MANIFEST.version)};`;
}
function parsePrivateWorkspacePath(pathname){
  if(!String(pathname||'').startsWith('/w/'))return null;
  const parts=String(pathname).split('/').filter(Boolean);
  if(parts[0]!=='w'||parts.length<2||parts.length>3)return false;
  let workspaceKey='';
  let serviceId='';
  try{
    workspaceKey=decodeURIComponent(parts[1]||'');
    serviceId=parts[2]?decodeURIComponent(parts[2]):'';
  }catch{return false}
  if(workspaceKey.length>180||!WORKSPACE_KEY_RE.test(workspaceKey))return false;
  if(serviceId&&(!SERVICE_ID_RE.test(serviceId)||!visibleServices().some(service=>service.id===serviceId)))return false;
  return {workspaceKey,serviceId};
}
async function manifestDrivenApp(request,env){
  const asset=await env.ASSETS.fetch(request);
  if(!asset.ok)return withHeaders(env,asset);
  const source=await asset.text();
  const block=/const SERVICES=\[[\s\S]*?const WORKSPACE_ENTRY_PRIORITY=\[[^\]]*\];/;
  if(!block.test(source)){
    const headers=new Headers(asset.headers);headers.set('x-ekodi-my-services','manifest-fallback');
    return withHeaders(env,new Response(source,{status:asset.status,statusText:asset.statusText,headers}));
  }
  const rewritten=source.replace(block,myServicePreamble());
  const headers=new Headers(asset.headers);
  headers.set('content-type','application/javascript; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-ekodi-my-services','manifest-v1');
  return withHeaders(env,new Response(rewritten,{status:asset.status,statusText:asset.statusText,headers}));
}
async function routedMyHome(request,env,route=null){
  const target=new URL(request.url);
  target.pathname='/';
  target.search='';
  target.hash='';
  const asset=await env.ASSETS.fetch(new Request(target.toString(),request));
  if(!asset.ok)return withHeaders(env,asset);
  const contentType=asset.headers.get('content-type')||'';
  if(!contentType.includes('text/html'))return withHeaders(env,asset);
  let source=await asset.text();
  if(!source.includes('/private-workspace-router.js'))source=source.replace('</head>',`${PRIVATE_ROUTER_TAG}</head>`);
  const headers=new Headers(asset.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  if(route){
    headers.set('x-ekodi-private-workspace','v1');
    headers.set('x-ekodi-workspace-service',route.serviceId||'workspace-home');
  }
  return injectEkodiShell(withHeaders(env,new Response(source,{status:asset.status,statusText:asset.statusText,headers})),'my');
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/config.js'){
      const cfg=runtimeConfig(env);
      return new Response(`window.EKODI_MY_CONFIG=${JSON.stringify(cfg)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
    }
    if(url.pathname==='/service-manifest.json')return json(env,{version:EKODI_SERVICE_MANIFEST.version,identityModel:EKODI_SERVICE_MANIFEST.identityModel,services:visibleServices()});
    if(url.pathname==='/life-channels.json')return json(env,{version:1,policy:'opt-in-least-privilege',proactiveLevels:['quiet','balanced','active'],outboundDefault:'human-approval',channels:[{id:'email',availability:'connector-ready'},{id:'sms',availability:'mobile-bridge-required'},{id:'kakao',availability:'official-api-limited'},{id:'instagram',availability:'provider-permission'},{id:'facebook',availability:'provider-permission'},{id:'slack',availability:'connector-ready'}]});
    if(url.pathname==='/health'){
      const cfg=runtimeConfig(env);
      return json(env,{ok:true,service:'ekodi-my',product:'my-ekodi',identity:'person-scoped',creatorPortfolio:true,personalBrandMarketing:true,universalMembership:true,ekodiShell:true,contextModel:'person-space-role',manifestDrivenServices:true,privateWorkspaceRouting:true,privateWorkspacePath:'/w/{workspace_key}/{service}',lifeChannels:true,proactiveUserAi:true,humanGatedOutbound:true,serviceManifestVersion:EKODI_SERVICE_MANIFEST.version,visibleServices:visibleServices().length,privacy:'private-first',dataMode:cfg.dataMode,dataEnabled:cfg.dataEnabled});
    }
    if(url.pathname==='/creator'||url.pathname==='/creator/')return Response.redirect('https://author.ekodi.kr/',307);
    if(url.pathname==='/personal-brand'||url.pathname==='/personal-brand/')return Response.redirect(personalBrandUrl(),307);
    if(url.pathname==='/app.js')return manifestDrivenApp(request,env);
    if(url.pathname==='/'||url.pathname==='')return routedMyHome(request,env);
    const privateRoute=parsePrivateWorkspacePath(url.pathname);
    if(privateRoute===false)return json(env,{ok:false,error:'private_workspace_route_not_found'},404);
    if(privateRoute)return routedMyHome(request,env,privateRoute);
    const response=withHeaders(env,await env.ASSETS.fetch(request));
    return injectEkodiShell(response,'my');
  }
};