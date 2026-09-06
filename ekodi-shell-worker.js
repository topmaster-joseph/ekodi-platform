import { EKODI_SERVICE_MANIFEST, serviceForHost, serviceForId, serviceForUrl } from './ekodi-service-manifest.js';
import { EKODI_USER_FOOTER } from './config/user-footer.js';
import { renderUserExperienceProfilesBootstrap } from './config/user-ui-experience-profiles.js';

const USER_SHORTCUT_GUARD=`(()=>{try{if(typeof document==='undefined')return;const current=document.currentScript;const serviceId=String(current?.dataset?.ekodiService||'').trim().toLowerCase();if(serviceId!=='my'){if(current)current.dataset.ekodiShell='off';document.documentElement.dataset.ekodiGlobalNav='off';}}catch{}})();`;
const USER_FOOTER_BOOTSTRAP=`window.__EKODI_USER_FOOTER_CONFIG__=${JSON.stringify(EKODI_USER_FOOTER).replace(/</g,'\\u003c')};`;
const USER_EXPERIENCE_PROFILES_BOOTSTRAP=renderUserExperienceProfilesBootstrap();

function corsHeaders(){return {'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','x-content-type-options':'nosniff'};}
function json(data,status=200,cache='public, max-age=60, stale-while-revalidate=300'){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,...corsHeaders()}});}
function withHeaders(response){const headers=new Headers(response.headers);headers.set('access-control-allow-origin','*');headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');headers.set('cross-origin-resource-policy','cross-origin');if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
async function safeAssetFetch(env,url,request){try{return await env.ASSETS.fetch(new Request(url,request));}catch{return new Response('',{status:503,headers:{'cache-control':'no-store','x-ekodi-shell-asset-error':'fetch_failed'}});}}
function bundleCacheRequest(request){const url=new URL(request.url);url.pathname='/shell.js';url.search='';url.searchParams.set('bundle',String(EKODI_SERVICE_MANIFEST.shellVersion||'1'));return new Request(url,{method:'GET'});}
async function bundledShell(request,env,ctx){
  let bundleCache=null,bundleCacheKey=null;
  if(request.method==='GET'&&typeof caches!=='undefined'){
    try{
      bundleCache=caches.default;
      bundleCacheKey=bundleCacheRequest(request);
      const cached=await bundleCache.match(bundleCacheKey);
      if(cached){
        const headers=new Headers(cached.headers);
        headers.set('cache-control','public, max-age=60, stale-while-revalidate=300');
        headers.set('x-ekodi-shell-bundle-cache','hit');
        return withHeaders(new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers}));
      }
    }catch{}
  }
  const shellUrl=new URL(request.url);shellUrl.pathname='/shell.js';
  const navUrl=new URL(request.url);navUrl.pathname='/user-global-nav.js';
  const contextUrl=new URL(request.url);contextUrl.pathname='/user-context.js';
  const userHeaderUrl=new URL(request.url);userHeaderUrl.pathname='/user-ui-header.js';
  const userFooterUrl=new URL(request.url);userFooterUrl.pathname='/user-ui-footer.js';
  const userLanguageUrl=new URL(request.url);userLanguageUrl.pathname='/user-language.js';
  const mediaMeetingUrl=new URL(request.url);mediaMeetingUrl.pathname='/media-meeting-adapter.js';
  const characterRegistryUrl=new URL(request.url);characterRegistryUrl.pathname='/character-registry.js';
  const characterIdentityUrl=new URL(request.url);characterIdentityUrl.pathname='/character-identity-registry.js';
  const userCharacterUrl=new URL(request.url);userCharacterUrl.pathname='/user-character.js';
  const ccmMrUrl=new URL(request.url);ccmMrUrl.pathname='/ccm-mr-player.js';
  const adminShellUrl=new URL(request.url);adminShellUrl.pathname='/admin-ui-shell.js';
  const headerUrl=new URL(request.url);headerUrl.pathname='/mobile-fixed-header.js';
  const messageUrl=new URL(request.url);messageUrl.pathname='/message-ui.js';
  const illustrationUrl=new URL(request.url);illustrationUrl.pathname='/illustration-system.js';
  const designInheritanceUrl=new URL(request.url);designInheritanceUrl.pathname='/service-design-inheritance.js';
  const linkCompatUrl=new URL(request.url);linkCompatUrl.pathname='/ecosystem-link-compat.js';
  const [shellResponse,navResponse,contextResponse,userHeaderResponse,userFooterResponse,userLanguageResponse,mediaMeetingResponse,characterRegistryResponse,characterIdentityResponse,userCharacterResponse,ccmMrResponse,adminShellResponse,headerResponse,messageResponse,illustrationResponse,designInheritanceResponse,linkCompatResponse]=await Promise.all([
    safeAssetFetch(env,shellUrl,request),
    safeAssetFetch(env,navUrl,request),
    safeAssetFetch(env,contextUrl,request),
    safeAssetFetch(env,userHeaderUrl,request),
    safeAssetFetch(env,userFooterUrl,request),
    safeAssetFetch(env,userLanguageUrl,request),
    safeAssetFetch(env,mediaMeetingUrl,request),
    safeAssetFetch(env,characterRegistryUrl,request),
    safeAssetFetch(env,characterIdentityUrl,request),
    safeAssetFetch(env,userCharacterUrl,request),
    safeAssetFetch(env,ccmMrUrl,request),
    safeAssetFetch(env,adminShellUrl,request),
    safeAssetFetch(env,headerUrl,request),
    safeAssetFetch(env,messageUrl,request),
    safeAssetFetch(env,illustrationUrl,request),
    safeAssetFetch(env,designInheritanceUrl,request),
    safeAssetFetch(env,linkCompatUrl,request),
  ]);
  if(!shellResponse.ok)return withHeaders(shellResponse);
  const shell=await shellResponse.text();
  const globalNav=navResponse.ok?await navResponse.text():'';
  const userContext=contextResponse.ok?await contextResponse.text():'';
  const userHeader=userHeaderResponse.ok?await userHeaderResponse.text():'';
  const userFooter=userFooterResponse.ok?await userFooterResponse.text():'';
  const userLanguage=userLanguageResponse.ok?await userLanguageResponse.text():'';
  const mediaMeeting=mediaMeetingResponse.ok?await mediaMeetingResponse.text():'';
  const characterRegistry=characterRegistryResponse.ok?await characterRegistryResponse.text():'';
  const characterIdentity=characterIdentityResponse.ok?await characterIdentityResponse.text():'';
  const userCharacter=userCharacterResponse.ok?await userCharacterResponse.text():'';
  const ccmMrPlayer=ccmMrResponse.ok?await ccmMrResponse.text():'';
  const adminShell=adminShellResponse.ok?await adminShellResponse.text():'';
  const fixedHeader=headerResponse.ok?await headerResponse.text():'';
  const messageUI=messageResponse.ok?await messageResponse.text():'';
  const illustrationSystem=illustrationResponse.ok?await illustrationResponse.text():'';
  const designInheritance=designInheritanceResponse.ok?await designInheritanceResponse.text():'';
  const linkCompat=linkCompatResponse.ok?await linkCompatResponse.text():'';
  const headers=new Headers(shellResponse.headers);
  headers.set('content-type','application/javascript; charset=utf-8');
  headers.set('cache-control','public, max-age=60, stale-while-revalidate=300');
  headers.set('x-ekodi-user-ui-header',userHeader?'v1':'missing');
  headers.set('x-ekodi-user-ui-footer',userFooter?`v${EKODI_USER_FOOTER.version}`:'missing');
  headers.set('x-ekodi-user-experience-profiles','v1');
  headers.set('x-ekodi-user-language',userLanguage?'v1':'missing');
  headers.set('x-ekodi-media-meeting',mediaMeeting?'v2':'missing');
  headers.set('x-ekodi-character-registry',characterRegistry?'v3':'missing');
  headers.set('x-ekodi-character-identity',characterIdentity?'v1':'missing');
  headers.set('x-ekodi-user-character',userCharacter?'v1':'missing');
  headers.set('x-ekodi-ccm-mr',ccmMrPlayer?'v1':'missing');
  headers.set('x-ekodi-admin-ui-shell',adminShell?'v1':'missing');
  headers.set('x-ekodi-message-ui',messageUI?'v1':'missing');
  headers.set('x-ekodi-illustration-system',illustrationSystem?'v1':'missing');
  headers.set('x-ekodi-service-design',designInheritance?'v1':'missing');
  headers.set('x-ekodi-link-compat',linkCompat?'v1':'missing');
  headers.set('x-ekodi-user-shortcuts','my-only');
  headers.set('x-ekodi-shell-bundle-cache','miss');
  const response=withHeaders(new Response(`${USER_SHORTCUT_GUARD}\n${USER_FOOTER_BOOTSTRAP}\n${USER_EXPERIENCE_PROFILES_BOOTSTRAP}\n${characterRegistry}\n${characterIdentity}\n${shell}\n${globalNav}\n${userContext}\n${userHeader}\n${userFooter}\n${userLanguage}\n${mediaMeeting}\n${userCharacter}\n${ccmMrPlayer}\n${adminShell}\n${fixedHeader}\n${messageUI}\n${illustrationSystem}\n${designInheritance}\n${linkCompat}\n`,{status:200,headers}));
  if(bundleCache&&bundleCacheKey&&ctx?.waitUntil){
    const stored=response.clone();
    stored.headers.set('cache-control','public, max-age=300');
    stored.headers.set('x-ekodi-shell-bundle-cache','stored');
    ctx.waitUntil(bundleCache.put(bundleCacheKey,stored).catch(()=>{}));
  }
  return response;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-shell',environment:env.ENVIRONMENT||'unknown',manifestVersion:EKODI_SERVICE_MANIFEST.version,shellVersion:EKODI_SERVICE_MANIFEST.shellVersion,userUIHeaderVersion:1,userUIFooterVersion:EKODI_USER_FOOTER.version,userLanguageVersion:5,mediaMeetingAdapterVersion:2,characterRegistryVersion:3,characterIdentityRegistryVersion:1,userCharacterVersion:5,ccmMrVersion:1,adminUIShellVersion:1,messageUIVersion:1,illustrationSystemVersion:1,serviceDesignVersion:4,userExperienceProfilesVersion:1,linkCompatVersion:1,userAccessPolicyVersion:1,identityModel:EKODI_SERVICE_MANIFEST.identityModel,services:EKODI_SERVICE_MANIFEST.services.length},200,'no-store');
    if(url.pathname==='/manifest.json')return json(EKODI_SERVICE_MANIFEST);
    if(url.pathname==='/user-footer.json')return json(EKODI_USER_FOOTER,200,'public, max-age=300, stale-while-revalidate=3600');
    if(url.pathname==='/service'){
      const id=url.searchParams.get('id');
      const canonicalUrl=url.searchParams.get('url');
      const host=url.searchParams.get('host');
      const service=id?serviceForId(id):canonicalUrl?serviceForUrl(canonicalUrl):host?serviceForHost(host):null;
      return service?json(service):json({error:'service_not_found'},404,'no-store');
    }
    if(url.pathname==='/shell.js')return bundledShell(request,env,ctx);
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?source=shell.ekodi.kr',307);
    if(url.pathname==='/')return Response.redirect('https://my.ekodi.kr/',302);
    return withHeaders(await safeAssetFetch(env,url,request));
  }
};
