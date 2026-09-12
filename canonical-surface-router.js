import { handleMailContactApi, mailContactPage } from './mail-contact.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

const CANONICAL_HOST='ekodi.kr';
const SURFACE_PREFIXES=Object.freeze({my:'/my',admin:'/admin',auth:'/auth'});
const SYSTEM_PATHS=Object.freeze(['/api','/mcp','/webhooks','/health']);
const PUBLIC_EXECUTION_SURFACES=Object.freeze([
  Object.freeze({id:'shell',prefix:'/shell',binding:'SHELL',virtualHost:'shell.ekodi.kr'}),
  Object.freeze({id:'ai',prefix:'/ai',binding:'AI',virtualHost:'ai.ekodi.kr'}),
  Object.freeze({id:'author',prefix:'/author',binding:'AUTHOR',virtualHost:'author.ekodi.kr'}),
  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',virtualHost:'bible.ekodi.kr',basePathAware:true}),
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
  Object.freeze({id:'support',prefix:'/support',binding:'SUPPORT',virtualHost:'support.ekodi.kr'}),
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
const CANONICAL_HOST_PATHS=Object.freeze({
  'admin.ekodi.kr':'/admin','auth.ekodi.kr':'/auth','api.ekodi.kr':'/api','my.ekodi.kr':'/my',
  'shell.ekodi.kr':'/shell','ai.ekodi.kr':'/ai','author.ekodi.kr':'/author','bible.ekodi.kr':'/bible',
  'books.ekodi.kr':'/books','business.ekodi.kr':'/business','community.ekodi.kr':'/community','edu.ekodi.kr':'/education',
  'energy.ekodi.kr':'/energy','exp.ekodi.kr':'/experience','try.ekodi.kr':'/experience','dev.ekodi.kr':'/developer',
  'finance-api.ekodi.kr':'/finance-api','journal.ekodi.kr':'/journal','life.ekodi.kr':'/life','management.ekodi.kr':'/management',
  'money.ekodi.kr':'/money','personal-finance-api.ekodi.kr':'/personal-finance-api','publishing.ekodi.kr':'/publishing',
  'social.ekodi.kr':'/social','space.ekodi.kr':'/space','drive.ekodi.kr':'/storage','support.ekodi.kr':'/support',
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
async function proxyAuth(request,legacyFetch){
  const response=await proxyLegacySurface(request,legacyFetch,SURFACE_PREFIXES.auth,'auth.ekodi.kr','auth');
  return rewriteHtmlResponse(response,rewriteAuthHtml);
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
    upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);
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
  const executionSurface=executionSurfaceForPath(path);if(executionSurface)return proxyExecutionSurface(request,env,executionSurface,legacyFetch,externalFetch);
  if(path===SURFACE_PREFIXES.my)return canonicalSlashRedirect(request,SURFACE_PREFIXES.my);
  if(path.startsWith(`${SURFACE_PREFIXES.my}/`))return proxyBinding(request,env?.MY,SURFACE_PREFIXES.my,'my');
  if(path===SURFACE_PREFIXES.auth)return canonicalSlashRedirect(request,SURFACE_PREFIXES.auth);
  if(path.startsWith(`${SURFACE_PREFIXES.auth}/`)){
    const documentRedirect=authAssetDocumentRedirect(request,path);if(documentRedirect)return documentRedirect;
    if(typeof legacyFetch!=='function')return serviceUnavailable('auth');
    return proxyAuth(request,legacyFetch);
  }
  if(path===SURFACE_PREFIXES.admin)return canonicalSlashRedirect(request,SURFACE_PREFIXES.admin);
  if(path.startsWith(`${SURFACE_PREFIXES.admin}/`)){
    if(typeof legacyFetch!=='function')return serviceUnavailable('admin');
    if(adminRuntimeRequest(path))return proxyAdminRuntime(request,legacyFetch);
    return proxyAdminShell(request,legacyFetch);
  }
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
  api:'/api',
  mcp:'/mcp',
  webhooks:'/webhooks',
  health:'/health',
  systemPaths:SYSTEM_PATHS,
});




