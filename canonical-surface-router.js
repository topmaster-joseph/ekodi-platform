import { handleMailContactApi, mailContactPage } from './mail-contact.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

const CANONICAL_HOST='ekodi.kr';
const SURFACE_PREFIXES=Object.freeze({my:'/my',admin:'/admin',auth:'/auth'});
const SYSTEM_PATHS=Object.freeze(['/api','/mcp','/webhooks','/health','/connect']);
const PERSONAL_FINANCE_CONTROL_PATH='/api/control/personal-finance';
const PUBLIC_EXECUTION_SURFACES=Object.freeze([
  Object.freeze({id:'shell',prefix:'/shell',binding:'SHELL',basePathAware:true}),
  Object.freeze({id:'mission-application',prefix:'/ekodimission/api/activities/260926-chuseok-open-table/applications',binding:'SPACE',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'ai',prefix:'/ai',binding:'AI',virtualHost:'ai.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'author',prefix:'/author',binding:'AUTHOR',virtualHost:'author.ekodi.kr'}),
  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',basePathAware:true}),
  Object.freeze({id:'books',prefix:'/books',binding:'BOOKS',virtualHost:'books.ekodi.kr'}),
  Object.freeze({id:'business',prefix:'/business',binding:'BUSINESS',virtualHost:'business.ekodi.kr',host:'business.ekodi.kr'}),
  Object.freeze({id:'community',prefix:'/community',binding:'COMMUNITY',virtualHost:'community.ekodi.kr'}),
  Object.freeze({id:'education',prefix:'/education',binding:'EDUCATION',virtualHost:'edu.ekodi.kr'}),
  Object.freeze({id:'energy',prefix:'/energy',binding:'ENERGY',virtualHost:'energy.ekodi.kr'}),
  Object.freeze({id:'experience',prefix:'/experience',binding:'EXPERIENCE',virtualHost:'exp.ekodi.kr'}),
  Object.freeze({id:'developer',prefix:'/developer',binding:'EXPERIENCE',virtualHost:'dev.ekodi.kr'}),
  Object.freeze({id:'finance-api',prefix:'/finance-api',binding:'FINANCE',virtualHost:'finance-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'journal',prefix:'/journal',binding:'JOURNAL',virtualHost:'journal.ekodi.kr'}),
  Object.freeze({id:'life',prefix:'/life',binding:'LIFE',virtualHost:'life.ekodi.kr'}),
  Object.freeze({id:'management',prefix:'/management',binding:'MANAGEMENT',virtualHost:'management.ekodi.kr'}),
  Object.freeze({id:'money',prefix:'/money',binding:'MONEY',virtualHost:'money.ekodi.kr'}),
  Object.freeze({id:'personal-finance-api',prefix:'/personal-finance-api',binding:'PERSONAL_FINANCE',virtualHost:'personal-finance-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'publishing',prefix:'/publishing',binding:'PUBLISHING',virtualHost:'publishing.ekodi.kr'}),
  Object.freeze({id:'social',prefix:'/social',binding:'SOCIAL',virtualHost:'social.ekodi.kr'}),
  Object.freeze({id:'space',prefix:'/space',binding:'SPACE',virtualHost:'space.ekodi.kr'}),
  Object.freeze({id:'storage',prefix:'/storage',binding:'STORAGE',virtualHost:'drive.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'support',prefix:'/support',binding:'SUPPORT',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'work',prefix:'/work',binding:'WORK',virtualHost:'work.ekodi.kr'}),
  Object.freeze({id:'workspace-api',prefix:'/workspace-api',binding:'WORKSPACE_PLATFORM',virtualHost:'workspace-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'marketing-api',prefix:'/marketing-api',binding:'MARKETING_DOMAIN',virtualHost:'marketing-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'marketing-connect-api',prefix:'/marketing-connect-api',binding:'MARKETING_GROWTH',virtualHost:'marketing-connect-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'marketing-publish-api',prefix:'/marketing-publish-api',binding:'MARKETING_PUBLISHING',virtualHost:'marketing-publish-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'pay',prefix:'/pay',legacyHost:'pay.ekodi.kr'}),
  Object.freeze({id:'live',prefix:'/live',legacyHost:'live.ekodi.kr'}),
  Object.freeze({id:'cloud',prefix:'/cloud',legacyHost:'cloud.ekodi.kr'}),
  Object.freeze({id:'trade',prefix:'/trade',legacyHost:'trade.ekodi.kr'}),
  Object.freeze({id:'lab',prefix:'/ekodilab',host:'ekodilab.pages.dev',canonicalHost:'lab.ekodi.kr'}),
  Object.freeze({id:'cafe',prefix:'/cafe',host:'ekodi-cafe.pages.dev',canonicalHost:'cafe.ekodi.kr'}),

]);
const legacyEkodiHost=label=>`${label}.${CANONICAL_HOST}`;
const CANONICAL_HOST_PATHS=Object.freeze({
  [legacyEkodiHost('admin')]:'/admin',[legacyEkodiHost('api')]:'/api',[legacyEkodiHost('my')]:'/my',
  'ai.ekodi.kr':'/ai','author.ekodi.kr':'/author','bible.ekodi.kr':'/bible',
  'books.ekodi.kr':'/books','business.ekodi.kr':'/business','community.ekodi.kr':'/community','edu.ekodi.kr':'/education',
  'energy.ekodi.kr':'/energy','exp.ekodi.kr':'/experience','try.ekodi.kr':'/experience','dev.ekodi.kr':'/developer',
  'finance-api.ekodi.kr':'/finance-api','journal.ekodi.kr':'/journal','life.ekodi.kr':'/life','management.ekodi.kr':'/management',
  'money.ekodi.kr':'/money','personal-finance-api.ekodi.kr':'/personal-finance-api','publishing.ekodi.kr':'/publishing',
  'social.ekodi.kr':'/social','space.ekodi.kr':'/space','drive.ekodi.kr':'/storage',
  'work.ekodi.kr':'/work','workspace-api.ekodi.kr':'/workspace-api','marketing-api.ekodi.kr':'/marketing-api',
  'marketing-connect-api.ekodi.kr':'/marketing-connect-api','marketing-publish-api.ekodi.kr':'/marketing-publish-api',
  'pay.ekodi.kr':'/pay','pay.biz.ekodi.kr':'/ekodibiz/pay','live.ekodi.kr':'/live','live.biz.ekodi.kr':'/live/biz',
  'live.church.ekodi.kr':'/live/church','live.lab.ekodi.kr':'/live/lab','cloud.ekodi.kr':'/cloud','trade.ekodi.kr':'/trade',
  'trade.biz.ekodi.kr':'/ekodibiz/trade','biz.ekodi.kr':'/ekodibiz','church.ekodi.kr':'/ekodichurch','lab.ekodi.kr':'/ekodilab',
  'mall.ekodi.kr':'/ekodibiz/mall','mall.biz.ekodi.kr':'/ekodibiz/mall','mail.ekodi.kr':'/mail','mail.biz.ekodi.kr':'/mail',
  'mail.church.ekodi.kr':'/mail','mail.lab.ekodi.kr':'/mail','mail.books.ekodi.kr':'/mail','mail.trade.ekodi.kr':'/mail',
  'messenger.ekodi.kr':'/messenger','invest.ekodi.kr':'/invest','tax.ekodi.kr':'/tax','cafe.ekodi.kr':'/cafe',
  'marketing.ekodi.kr':'/ekodibiz/marketing-ai','cgma.ekodi.kr':'/cgma','jadam.ekodi.kr':'/jadam','pizzamaru.ekodi.kr':'/pizzamaru','yogurt.ekodi.kr':'/yogurt',
  'jadam.ai.ekodi.kr':'/jadam/marketing','pizzamaru.ai.ekodi.kr':'/pizzamaru/marketing','yogurt.ai.ekodi.kr':'/yogurt/marketing','cgma.ai.ekodi.kr':'/cgma/marketing'
});const ADMIN_RUNTIME_FILE=/\.(?:js|css|cmd|json|map|svg|png|webp|ico)$/i;
const AUTH_TOP_LEVEL_TEXT_ASSET=/\.(?:js|css|json|map)$/i;
const AUTH_CSP=[
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "script-src 'self' https://cdn.jsdelivr.net https://esm.sh https://accounts.google.com/gsi/client https://js.tosspayments.com",
  "connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net https://esm.sh https://accounts.google.com/gsi/ https://*.tosspayments.com",
  "frame-src https://accounts.google.com/gsi/ https://accounts.google.com/ https://*.tosspayments.com",
  "img-src 'self' data: https://lh3.googleusercontent.com https://*.tosspayments.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://renzehysxirjilvdxacv.supabase.co https://*.tosspayments.com",
  "object-src 'none'",
].join('; ');
const AUTH_ASSETS=new Set(['/auth.js','/auth-bootstrap.js','/auth-entry.js','/auth.css','/auth-router.js','/oauth-consent.js','/marketing-auth-hotfix.js','/auth-workspace-target.js','/admin-auth.js','/google-origin-bridge.js','/client-auth.js','/author-auth.js','/business-auth.js','/marketing-onboarding.js','/membership-ui.js']);
const AUTH_CRITICAL_ASSETS=new Set(['/auth.js','/auth-bootstrap.js','/auth-entry.js','/auth-router.js','/oauth-consent.js','/marketing-auth-hotfix.js','/auth-workspace-target.js','/admin-auth.js','/google-origin-bridge.js','/client-auth.js','/author-auth.js','/business-auth.js','/marketing-onboarding.js','/membership-ui.js']);

function cloneRequest(request,url){
  return new Request(url.toString(),{
    method:request.method,
    headers:request.headers,
    body:['GET','HEAD'].includes(request.method)?undefined:request.body,
    redirect:request.redirect,
  });
}
function stripPrefix(pathname,prefix){
  if(!prefix)return pathname||'/';
  if(pathname===prefix||pathname===`${prefix}/`)return '/';
  const rest=pathname.slice(prefix.length);
  return rest.startsWith('/')?rest:`/${rest}`;
}
function canonicalSlashRedirect(request,prefix){
  const target=new URL(request.url);target.pathname=`${prefix}/`;
  return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
function directDocumentNavigation(request){
  return String(request.headers.get('sec-fetch-dest')||'').toLowerCase()==='document';
}
function authAssetDocumentRedirect(request,pathname){
  const stripped=stripPrefix(pathname,SURFACE_PREFIXES.auth);
  if(!directDocumentNavigation(request)||!AUTH_TOP_LEVEL_TEXT_ASSET.test(stripped))return null;
  const target=new URL(request.url);target.pathname=`${SURFACE_PREFIXES.auth}/`;target.search='';target.hash='';
  return new Response(null,{status:302,headers:{location:target.toString(),'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'auth-document-guard'}});
}
function serviceUnavailable(surface){
  return new Response(`${surface} surface unavailable`,{status:503,headers:{
    'cache-control':'no-store','content-type':'text/plain; charset=utf-8',
    'x-content-type-options':'nosniff','x-ekodi-surface':surface,
  }});
}
async function proxyBinding(request,binding,prefix,surface){
  if(!binding?.fetch)return serviceUnavailable(surface);
  const upstreamUrl=new URL(request.url);
  upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,prefix);
  const response=await binding.fetch(cloneRequest(request,upstreamUrl));
  const routed=new Response(response.body,response);
  routed.headers.set('x-ekodi-canonical-surface',surface);
  routed.headers.set('x-ekodi-canonical-path',prefix||'/');
  return routed;
}
async function proxyPersonalFinanceAdminControl(request,env){
  if(!env?.PERSONAL_FINANCE?.fetch)return serviceUnavailable('personal-finance-admin-control');
  const target=new URL(request.url);target.pathname='/api/admin/personal-finance/control';target.search='';
  const headers=new Headers(request.headers);headers.set('x-ekodi-admin-proxy','personal-finance-binding-v1');
  const body=['GET','HEAD'].includes(request.method)?undefined:request.body;
  const upstream=await env.PERSONAL_FINANCE.fetch(new Request(target,{method:request.method,headers,body,redirect:'manual'}));
  let response;
  if(upstream.status===401){
    response=new Response(JSON.stringify({error:'EKODI 관리자 인증이 필요합니다.',code:'PF_ADMIN_AUTH_REQUIRED'}),{status:401,headers:{'content-type':'application/json; charset=utf-8'}});
  }else response=new Response(upstream.body,upstream);
  response.headers.set('x-ekodi-personal-finance-proxy','service-binding-v1');
  response.headers.set('x-ekodi-canonical-surface','system');
  response.headers.set('x-ekodi-canonical-path','/api');
  response.headers.set('cache-control','no-store');
  response.headers.set('x-content-type-options','nosniff');
  return response;
}
async function proxyLegacySurface(request,legacyFetch,prefix,legacyHost,surface){
  const upstreamUrl=new URL(request.url);
  upstreamUrl.hostname=legacyHost;
  upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,prefix);
  const response=await legacyFetch(cloneRequest(request,upstreamUrl));
  const routed=new Response(response.body,response);
  routed.headers.set('x-ekodi-canonical-surface',surface);
  routed.headers.set('x-ekodi-canonical-path',prefix);
  return routed;
}
async function rewriteHtmlResponse(response,transform){
  const type=String(response.headers.get('content-type')||'');
  if(!type.includes('text/html'))return response;
  const headers=new Headers(response.headers);
  const text=await response.text();
  headers.delete('content-length');
  return new Response(transform(text),{status:response.status,statusText:response.statusText,headers});
}
function rewriteAuthHtml(html){
  return html.replace(/(href|src)="\/(?!auth\/)/g,'$1="/auth/');
}
function rewriteAdminHtml(html){
  if(/<base\s/i.test(html))return html;
  return html.replace(/<head(\s[^>]*)?>/i,match=>`${match}<base href="/admin/">`);
}
function executionSurfaceForPath(pathname){return PUBLIC_EXECUTION_SURFACES.find(item=>item.exact?pathname===item.prefix:(pathname===item.prefix||pathname.startsWith(`${item.prefix}/`)))||null}
function canonicalAbsoluteUrl(host,pathname='/',search='',hash=''){
  const prefix=CANONICAL_HOST_PATHS[String(host||'').toLowerCase()];if(!prefix)return '';
  const suffix=pathname==='/'?'':pathname;return `https://${CANONICAL_HOST}${prefix}${suffix}${search||''}${hash||''}`;
}
function rewriteAbsoluteEkodiOrigins(text){
  let output=String(text||'');
  for(const [host,prefix] of Object.entries(CANONICAL_HOST_PATHS)){
    const from=`https://${host}`;const to=`https://${CANONICAL_HOST}${prefix}`;
    output=output.replaceAll(from,to).replaceAll(encodeURIComponent(from),encodeURIComponent(to));
  }
  return output;
}
function prefixRootLiterals(text,prefix){
  if(!prefix||prefix==='/')return text;
  return String(text||'').replace(/(["'`])\/(?!\/)([^"'`\r\n]*)\1/g,(match,q,rest)=>{
    const path=`/${rest}`;if(path===prefix||path.startsWith(`${prefix}/`))return match;
    return `${q}${prefix}${path}${q}`;
  });
}
function rewriteExecutionText(text,spec,type=''){
  let output=rewriteAbsoluteEkodiOrigins(text);
  if(spec.basePathAware)return output;
  if(type.includes('text/html')||type.includes('javascript')||type.includes('application/json')||type.includes('text/plain'))output=prefixRootLiterals(output,spec.prefix);
  if(type.includes('text/css'))output=output.replace(/url\(\s*(["']?)\/(?!\/)/g,(m,q)=>`url(${q}${spec.prefix}/`);
  if(spec.id==='business')output=output.replace("function routeWorkspaceId(){\n  const path=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();\n  if(path)return path;","function routeWorkspaceId(){\n  const path=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();\n  if(path.startsWith('business/'))return path.slice('business/'.length).split('/')[0];\n  if(path&&path!=='business')return path;");
  return output;
}
function canonicalExecutionLocation(value,spec){
  try{
    const target=new URL(value);
    const canonical=canonicalAbsoluteUrl(target.hostname,target.pathname,target.search,target.hash);
    if(canonical)return canonical;
    if(spec.host&&target.hostname===spec.host)return `https://${CANONICAL_HOST}${spec.prefix}${target.pathname==='/'?'':target.pathname}${target.search}${target.hash}`;
  }catch{}
  return value;
}function adminRuntimeRequest(path){
  const stripped=stripPrefix(path,SURFACE_PREFIXES.admin);
  return ADMIN_RUNTIME_FILE.test(stripped)||stripped.startsWith('/api/')||stripped==='/auth/start';
}
async function proxyAdminShell(request,legacyFetch){
  const upstreamUrl=new URL(request.url);
  upstreamUrl.hostname='admin.ekodi.kr';
  upstreamUrl.pathname='/';
  const response=await legacyFetch(cloneRequest(request,upstreamUrl));
  const routed=await rewriteHtmlResponse(response,rewriteAdminHtml);
  routed.headers.set('x-ekodi-canonical-surface','admin');
  routed.headers.set('x-ekodi-canonical-path','/admin');
  return routed;
}
function applyAuthSecurity(response,cacheControl,routeName){
  const secured=new Response(response.body,response);
  const headers=secured.headers;
  headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), usb=()');
  headers.set('X-XSS-Protection','0');
  const type=String(headers.get('Content-Type')||'');
  if(type&&!/;\s*charset=/i.test(type)&&(/^text\//i.test(type)||/^application\/(?:javascript|json|xml)(?:;|$)/i.test(type)))headers.set('Content-Type',`${type}; charset=utf-8`);
  headers.set('Content-Security-Policy',AUTH_CSP);
  headers.set('Cache-Control',cacheControl);
  headers.set('X-EKODI-Route',routeName);
  return secured;
}
async function serveCanonicalAuth(request,env){
  if(!env?.ASSETS?.fetch)return serviceUnavailable('auth');
  const url=new URL(request.url);
  const stripped=stripPrefix(url.pathname,SURFACE_PREFIXES.auth);
  let assetPath='',routeName='central-auth-asset',cacheControl='no-store',rewrite=false;
  if(stripped==='/'||stripped==='/index.html'||stripped==='/login'||stripped==='/login/'){
    assetPath='/auth-center';routeName='central-auth';rewrite=true;
  }else if(stripped==='/google-origin-bridge'||stripped==='/google-origin-bridge/'){
    assetPath='/google-origin-bridge';routeName='google-origin-bridge';
  }else if(stripped==='/oauth/consent'||stripped==='/oauth/consent/'){
    assetPath='/oauth-consent';routeName='oauth-consent';
  }else if(AUTH_ASSETS.has(stripped)){
    assetPath=stripped;cacheControl=AUTH_CRITICAL_ASSETS.has(stripped)?'no-store':'public, max-age=300';
  }else return null;
  const assetUrl=new URL(request.url);assetUrl.pathname=assetPath;
  let response=await env.ASSETS.fetch(cloneRequest(request,assetUrl));
  if(rewrite)response=await rewriteHtmlResponse(response,rewriteAuthHtml);
  response=applyAuthSecurity(response,cacheControl,routeName);
  response.headers.set('x-ekodi-canonical-surface','auth');
  response.headers.set('x-ekodi-canonical-path','/auth');
  return response;
}
async function proxyAdminRuntime(request,legacyFetch){
  return proxyLegacySurface(request,legacyFetch,SURFACE_PREFIXES.admin,'admin.ekodi.kr','admin');
}
async function proxyExecutionSurface(request,env,spec,legacyFetch,externalFetch){
  const upstreamUrl=new URL(request.url);
  let response;
  if(spec.binding&&env?.[spec.binding]?.fetch){
    const binding=env[spec.binding];
    upstreamUrl.hostname=spec.virtualHost||CANONICAL_HOST;
    upstreamUrl.pathname=spec.preservePrefix?upstreamUrl.pathname:stripPrefix(upstreamUrl.pathname,spec.prefix);
    response=await binding.fetch(cloneRequest(request,upstreamUrl));
  }else if(spec.legacyHost){
    if(typeof legacyFetch!=='function')return serviceUnavailable(spec.id);
    upstreamUrl.hostname=spec.legacyHost;upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);
    response=await legacyFetch(cloneRequest(request,upstreamUrl));
  }else if(spec.assetPath){
    if(!env?.ASSETS?.fetch)return serviceUnavailable(spec.id);
    upstreamUrl.pathname=spec.assetPath;upstreamUrl.search='';
    response=await env.ASSETS.fetch(cloneRequest(request,upstreamUrl));
  }else if(spec.host){
    if(typeof externalFetch!=='function')return serviceUnavailable(spec.id);
    upstreamUrl.hostname=spec.host;upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);
    response=await externalFetch(cloneRequest(request,upstreamUrl));
  }else return serviceUnavailable(spec.id);
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  const headers=new Headers(response.headers);let body=response.body;
  if(type.includes('text/html')||type.includes('javascript')||type.includes('text/css')||type.includes('application/json')||type.includes('text/plain')){
    body=rewriteExecutionText(await response.text(),spec,type);headers.delete('content-length');headers.delete('etag');headers.delete('content-encoding');
  }
  const location=headers.get('location');if(location)headers.set('location',canonicalExecutionLocation(location,spec));
  headers.set('x-ekodi-canonical-surface',spec.id);headers.set('x-ekodi-canonical-path',spec.prefix);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}export async function routeCanonicalSurface(request,env,{legacyFetch,externalFetch=globalThis.fetch}={}){
  const url=new URL(request.url);
  if(url.hostname.toLowerCase()!==CANONICAL_HOST)return null;
  const path=url.pathname;
  const contactResponse=await handleMailContactApi(request,env);
  if(contactResponse)return contactResponse;
  if(request.method==='GET'&&path==='/mail/contact'){
    const page=mailContactPage();
    return typeof HTMLRewriter==='function'?injectEkodiShell(page,'mail'):page;
  }
  if(['GET','HEAD'].includes(request.method)&&(path==='/connect'||path==='/connect/')){
    const target=new URL('/auth/',request.url);
    target.searchParams.set('site','ai');
    target.searchParams.set('return_to','https://ekodi.kr/ai/');
    target.searchParams.set('source','mcp-connect');
    return new Response(null,{status:302,headers:{
      location:target.toString(),
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'x-ekodi-route':'mcp-connect-auth',
      'x-robots-tag':'noindex, nofollow, noarchive',
    }});
  }
  const executionSurface=executionSurfaceForPath(path);if(executionSurface)return proxyExecutionSurface(request,env,executionSurface,legacyFetch,externalFetch);
  if(path===SURFACE_PREFIXES.my)return canonicalSlashRedirect(request,SURFACE_PREFIXES.my);
  if(path.startsWith(`${SURFACE_PREFIXES.my}/`))return proxyBinding(request,env?.MY,SURFACE_PREFIXES.my,'my');
  if(path===SURFACE_PREFIXES.auth)return canonicalSlashRedirect(request,SURFACE_PREFIXES.auth);
  if(path.startsWith(`${SURFACE_PREFIXES.auth}/`)){
    const documentRedirect=authAssetDocumentRedirect(request,path);if(documentRedirect)return documentRedirect;
    return serveCanonicalAuth(request,env);
  }
  if(path===SURFACE_PREFIXES.admin)return canonicalSlashRedirect(request,SURFACE_PREFIXES.admin);
  if(path.startsWith(`${SURFACE_PREFIXES.admin}/`)){
    if(typeof legacyFetch!=='function')return serviceUnavailable('admin');
    if(adminRuntimeRequest(path))return proxyAdminRuntime(request,legacyFetch);
    return proxyAdminShell(request,legacyFetch);
  }
  if(path===PERSONAL_FINANCE_CONTROL_PATH)return proxyPersonalFinanceAdminControl(request,env);
  if(path==='/mcp'||path.startsWith('/api/')||path==='/api'||path.startsWith('/webhooks/')||path==='/health'||path==='/.well-known/oauth-protected-resource'){
    return proxyBinding(request,env?.CONTROL_API,'','system');
  }
  return null;
}
export const EKODI_CANONICAL_SURFACES=Object.freeze({
  host:CANONICAL_HOST,
  public:'/',
  user:'/my',
  admin:'/admin',
  auth:'/auth',
  shell:'/shell',
  api:'/api',
  mcp:'/mcp',
  webhooks:'/webhooks',
  health:'/health',
  systemPaths:SYSTEM_PATHS,
});
