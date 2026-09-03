import { injectEkodiShell } from './ekodi-shell-injector.js';
import { projectValue } from './secure-projection.js';
import { EXPERIENCE_META, getExperienceCatalog } from './experience-catalog.js';

const SECURITY_HEADERS = {
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' https://shell.ekodi.kr; connect-src 'self' https://shell.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
};
const PUBLIC_CACHE='public, max-age=60, stale-while-revalidate=300';
function json(data,status=200,cache='no-store'){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,...SECURITY_HEADERS}});
}
function withHeaders(response,cache=null){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(SECURITY_HEADERS)) headers.set(key,value);
  if(cache) headers.set('cache-control',cache);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function projectedCatalog(){
  return projectValue(getExperienceCatalog(),{profile:'experience_public',purpose:'experience-public-catalog'});
}
async function shellHtml(env,request){
  const assetUrl=new URL('/',request.url);
  const response=await env.ASSETS.fetch(new Request(assetUrl,request));
  return injectEkodiShell(withHeaders(response,PUBLIC_CACHE),'experience','public');
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'')||'/';
    if(request.method!=='GET' && request.method!=='HEAD') return json({error:'read_only_experience'},405);
    if(path==='/health') return json({ok:true,service:'ekodi-experience',publicName:EXPERIENCE_META.publicName,boundary:'registered-common-service',canonical:EXPERIENCE_META.canonicalOrigin,dataPolicy:'synthetic-only',sideEffects:'none',projection:'experience_public',modes:['user','developer'],shell:'v2'});
    if(path==='/api/catalog') return json(projectedCatalog(),200,PUBLIC_CACHE);
    if(path==='/admin') return Response.redirect('https://admin.ekodi.kr/?route=campus&source=try.ekodi.kr',307);
    if(path==='/' || path==='/user' || path==='/developer') return shellHtml(env,request);
    const response=await env.ASSETS.fetch(request);
    return withHeaders(response,response.headers.get('content-type')?.includes('text/html')?PUBLIC_CACHE:'public, max-age=86400, immutable');
  },
};
