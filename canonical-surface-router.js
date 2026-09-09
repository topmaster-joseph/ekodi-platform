import { handleMailContactApi, mailContactPage } from './mail-contact.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';
import { routeCheonggyeAssociation } from './cheonggye-association-route.js';

const CANONICAL_HOST='ekodi.kr';
const SURFACE_PREFIXES=Object.freeze({my:'/my',admin:'/admin',auth:'/auth'});
const SYSTEM_PATHS=Object.freeze(['/api','/mcp','/webhooks','/health']);
const PUBLIC_EXECUTION_SURFACES=Object.freeze([
  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',basePathAware:true}),
  Object.freeze({id:'business',prefix:'/business',host:'business.ekodi.kr'}),
]);
const ADMIN_RUNTIME_FILE=/\.(?:js|css|cmd|json|map|svg|png|webp|ico)$/i;
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
function rewriteExecutionText(text,spec,type=''){
  let output=String(text||'');
  if(type.includes('text/html')) output=output.replace(/(href|src|action)=(["'])\/(?!\/)/g,(m,a,q)=>`${a}=${q}${spec.prefix}/`);
  if(spec.id==='business'){
    output=output.replace(/fetch\((['"])\/api\//g,(m,q)=>`fetch(${q}${spec.prefix}/api/`).replaceAll('https://auth.ekodi.kr/','https://ekodi.kr/auth/').replaceAll('https%3A%2F%2Fbusiness.ekodi.kr%2F','https%3A%2F%2Fekodi.kr%2Fbusiness');
    output=output.replace("function routeWorkspaceId(){\n  const path=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();\n  if(path)return path;","function routeWorkspaceId(){\n  const path=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();\n  if(path.startsWith('business/'))return path.slice('business/'.length).split('/')[0];\n  if(path&&path!=='business')return path;");
    output=output.replace("if(push&&location.pathname!==`/${workspace.id}`)history.pushState({workspace:workspace.id},'',`/${workspace.id}`);","const nextPath=location.hostname==='ekodi.kr'?`/business/${workspace.id}`:`/${workspace.id}`;if(push&&location.pathname!==nextPath)history.pushState({workspace:workspace.id},'',nextPath);");
  }
  return output;
}
function canonicalExecutionLocation(value,spec){try{const target=new URL(value);if(spec.host&&target.hostname===spec.host){target.hostname=CANONICAL_HOST;target.pathname=spec.prefix+(target.pathname==='/'?'':target.pathname);return target.toString()}if(target.hostname==='admin.ekodi.kr'){target.hostname=CANONICAL_HOST;target.pathname=target.pathname==='/'?'/admin/':`/admin${target.pathname}`;return target.toString()}if(target.hostname==='auth.ekodi.kr'){target.hostname=CANONICAL_HOST;target.pathname=target.pathname==='/'?'/auth/':`/auth${target.pathname}`;return target.toString()}}catch{}return value}
function adminRuntimeRequest(path){
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
async function proxyExecutionSurface(request,env,spec,externalFetch){
  const upstreamUrl=new URL(request.url);
  let response;
  if(spec.binding){
    const binding=env?.[spec.binding];if(!binding?.fetch)return serviceUnavailable(spec.id);
    upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);
    response=await binding.fetch(cloneRequest(request,upstreamUrl));
  }else if(spec.assetPath){
    if(!env?.ASSETS?.fetch)return serviceUnavailable(spec.id);
    upstreamUrl.pathname=spec.assetPath;
    upstreamUrl.search='';
    response=await env.ASSETS.fetch(cloneRequest(request,upstreamUrl));
  }else{
    if(typeof externalFetch!=='function')return serviceUnavailable(spec.id);
    upstreamUrl.hostname=spec.host;
    upstreamUrl.pathname=stripPrefix(upstreamUrl.pathname,spec.prefix);
    response=await externalFetch(cloneRequest(request,upstreamUrl));
  }
  const type=String(response.headers.get('content-type')||'');
  const headers=new Headers(response.headers);let body=response.body;
  if(!spec.basePathAware&&(type.includes('text/html')||type.includes('javascript'))){body=rewriteExecutionText(await response.text(),spec,type);headers.delete('content-length');headers.delete('etag');}
  const location=headers.get('location');if(location)headers.set('location',canonicalExecutionLocation(location,spec));
  headers.set('x-ekodi-canonical-surface',spec.id);headers.set('x-ekodi-canonical-path',spec.prefix);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
export async function routeCanonicalSurface(request,env,{legacyFetch,externalFetch=globalThis.fetch}={}){
  const url=new URL(request.url);
  if(url.hostname.toLowerCase()!==CANONICAL_HOST)return null;
  const path=url.pathname;
  const cheonggyeResponse=await routeCheonggyeAssociation(request,env);if(cheonggyeResponse)return cheonggyeResponse;
  const contactResponse=await handleMailContactApi(request,env);
  if(contactResponse)return contactResponse;
  if(request.method==='GET'&&path==='/mail/contact'){
    const page=mailContactPage();
    return typeof HTMLRewriter==='function'?injectEkodiShell(page,'mail'):page;
  }
  const executionSurface=executionSurfaceForPath(path);if(executionSurface)return proxyExecutionSurface(request,env,executionSurface,externalFetch);
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