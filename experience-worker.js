import { injectEkodiShell } from './ekodi-shell-injector.js';
import { projectValue } from './secure-projection.js';
import { EXPERIENCE_META, getExperienceCatalog } from './experience-catalog.js';
import { DEVELOPER_PORTAL_META, PUBLIC_CONFORMANCE_CONTRACT } from './developer-public-contract.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://ekodi.kr; script-src 'self' https://ekodi.kr; connect-src 'self' https://ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'",
};
const PUBLIC_CACHE='public, max-age=60, stale-while-revalidate=300';
const STATIC_CACHE='public, max-age=86400, immutable';

function json(data,status=200,cache='no-store'){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,...SECURITY_HEADERS}});
}
function withHeaders(response,cache=null){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);
  if(cache)headers.set('cache-control',cache);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function projectedCatalog(){return projectValue(getExperienceCatalog(),{profile:'experience_public',purpose:'experience-public-catalog'});}
async function htmlAsset(env,request,path,serviceId){
  const assetUrl=new URL(path,request.url);
  const response=await env.ASSETS.fetch(new Request(assetUrl,request));
  return injectEkodiShell(withHeaders(response,PUBLIC_CACHE),serviceId,'public');
}
async function staticAsset(env,request,path){
  const assetUrl=new URL(path,request.url);
  const response=await env.ASSETS.fetch(new Request(assetUrl,request));
  return withHeaders(response,STATIC_CACHE);
}
function adminRedirect(){return withHeaders(Response.redirect('https://ekodi.kr/admin/experience',307),'no-store');}
function experienceHealth(){return {
  ok:true,service:'ekodi-experience',publicName:EXPERIENCE_META.publicName,
  boundary:'registered-common-service',canonical:EXPERIENCE_META.canonicalOrigin,
  dataPolicy:'synthetic-only',sideEffects:'none',projection:'experience_public',
  modes:['user','developer'],shell:'v2'
};}
function developerHealth(){return {
  ok:true,service:'ekodi-developer-portal',publicName:DEVELOPER_PORTAL_META.publicName,
  boundary:'registered-public-developer-service',canonical:DEVELOPER_PORTAL_META.canonicalOrigin,
  standard:DEVELOPER_PORTAL_META.standardName,standardVersion:DEVELOPER_PORTAL_META.standardVersion,
  dataPolicy:DEVELOPER_PORTAL_META.dataPolicy,sideEffects:'none',conformance:'public-preflight',shell:'v2'
};}
export default {
  async fetch(request,env){
    const url=new URL(request.url);const surface=String(request.headers.get('x-ekodi-canonical-surface')||'experience').toLowerCase();const path=url.pathname.replace(/\/+$/,'')||'/';
    if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'read_only_public_surface'},405);
    if(surface==='developer'){
      if(path==='/health')return json(developerHealth(),200,PUBLIC_CACHE);
      if(path==='/api/contract')return json(PUBLIC_CONFORMANCE_CONTRACT,200,PUBLIC_CACHE);
      if(path==='/admin')return adminRedirect();
      if(path==='/experience')return withHeaders(Response.redirect('https://ekodi.kr/experience/',307),'no-store');
      if(['/','/standard','/standards','/contract','/validate','/sdk','/sandbox','/certify','/certification'].includes(path))return htmlAsset(env,request,'/developer','developer');
      if(path==='/developer.css'||path==='/developer.js')return staticAsset(env,request,path);
      return json({error:'not_found'},404,PUBLIC_CACHE);
    }

    if(path==='/health')return json(experienceHealth(),200,PUBLIC_CACHE);
    if(path==='/api/catalog')return json(projectedCatalog(),200,PUBLIC_CACHE);
    if(path==='/admin')return adminRedirect();
    if(path==='/'||path==='/user'||path==='/developer')return htmlAsset(env,request,'/','experience');
    const response=await env.ASSETS.fetch(request);
    const cache=response.headers.get('content-type')?.includes('text/html')?PUBLIC_CACHE:STATIC_CACHE;
    return withHeaders(response,cache);
  },
};
