import { EKODI_SERVICE_MANIFEST, serviceForHost, serviceForId } from './ekodi-service-manifest.js';

function corsHeaders(){return {'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','x-content-type-options':'nosniff'};}
function json(data,status=200,cache='public, max-age=60, stale-while-revalidate=300'){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,...corsHeaders()}});}
function withHeaders(response){const headers=new Headers(response.headers);headers.set('access-control-allow-origin','*');headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');headers.set('cross-origin-resource-policy','cross-origin');if(!headers.has('cache-control'))headers.set('cache-control','public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-shell',environment:env.ENVIRONMENT||'unknown',manifestVersion:EKODI_SERVICE_MANIFEST.version,shellVersion:EKODI_SERVICE_MANIFEST.shellVersion,identityModel:EKODI_SERVICE_MANIFEST.identityModel,services:EKODI_SERVICE_MANIFEST.services.length},200,'no-store');
    if(url.pathname==='/manifest.json')return json(EKODI_SERVICE_MANIFEST);
    if(url.pathname==='/service'){
      const id=url.searchParams.get('id');const host=url.searchParams.get('host');const service=id?serviceForId(id):host?serviceForHost(host):null;
      return service?json(service):json({error:'service_not_found'},404,'no-store');
    }
    if(url.pathname==='/')return Response.redirect('https://my.ekodi.kr/',302);
    return withHeaders(await env.ASSETS.fetch(request));
  }
};
