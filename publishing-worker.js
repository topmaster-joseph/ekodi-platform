import { injectEkodiShell } from './ekodi-shell-injector.js';
import { handlePrivateReleaseAdmin } from './publishing/human/private-release-api.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/publishing/private-releases'||url.pathname.startsWith('/api/publishing/private-releases/')){
      const reply=await handlePrivateReleaseAdmin(request,env);
      if(reply)return reply;
    }
    if(url.pathname==='/health')return json({
      ok:true,
      service:'ekodi-publishing',
      publicName:'출판',
      professionalService:true,
      independentPlatform:true,
      modules:['consultation','production','distribution','studio','upaper'],
      identityModel:'person-space-role',
      shell:'v2',
      membership:'universal-free-lazy',
      aiDependency:'optional',
      providerFailureMode:'core',
      adminSeparated:true,
      bookstoreRelationship:'explicit-public-handoff-only',
      privateCrossServiceDataAccess:false,
      externalSubmissionExecution:false
    });
    if(url.pathname==='/admin'||url.pathname==='/admin/'||url.pathname==='/admin.html')return Response.redirect('https://ekodi.kr/admin/publishing#publishing',307);
    if(url.pathname==='/books.json'){
      // Use a private Service Binding: public apex-to-apex fetch can recurse or fail on Workers.
      if(!env?.BOOKS?.fetch)return json({ok:false,error:'PUBLIC_BOOK_CATALOG_UNAVAILABLE'},503);
      const catalogUrl=new URL(request.url);
      catalogUrl.pathname='/books.json';
      catalogUrl.search='';
      const upstream=await env.BOOKS.fetch(new Request(catalogUrl,{method:'GET',headers:{accept:'application/json'}}));
      return new Response(upstream.body,{status:upstream.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    }
    if(url.pathname==='/publishing/'||url.pathname==='/publishing')return Response.redirect('https://ekodi.kr/publishing/',308);
    if(url.pathname.startsWith('/publishing/studio'))return Response.redirect('https://ekodi.kr/publishing/studio/',308);
    if(url.pathname.startsWith('/publishing/upaper'))return Response.redirect('https://ekodi.kr/publishing/upaper/',308);
    return injectEkodiShell(withHeaders(await env.ASSETS.fetch(request)),'publishing');
  }
};
