import { injectEkodiShell } from './ekodi-shell-injector.js';

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
    if(url.pathname==='/health')return json({
      ok:true,
      service:'ekodi-publishing',
      professionalService:true,
      modules:['consultation','production','distribution','studio','upaper'],
      identityModel:'person-space-role',
      shell:'v2',
      membership:'universal-free-lazy',
      aiDependency:'optional',
      providerFailureMode:'core',
      adminSeparated:true,
      privateCrossServiceDataAccess:false,
      externalSubmissionExecution:false
    });
    if(url.pathname==='/admin'||url.pathname==='/admin/'||url.pathname==='/admin.html')return Response.redirect('https://admin.ekodi.kr/publishing#publishing',307);
    if(url.pathname==='/books.json'){
      const upstream=await fetch('https://books.ekodi.kr/books.json',{headers:{accept:'application/json'}});
      return new Response(upstream.body,{status:upstream.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    }
    if(url.pathname==='/publishing/'||url.pathname==='/publishing')return Response.redirect('https://publishing.ekodi.kr/',308);
    if(url.pathname.startsWith('/publishing/studio'))return Response.redirect('https://publishing.ekodi.kr/studio/',308);
    if(url.pathname.startsWith('/publishing/upaper'))return Response.redirect('https://publishing.ekodi.kr/upaper/',308);
    return injectEkodiShell(withHeaders(await env.ASSETS.fetch(request)),'publishing');
  }
};
