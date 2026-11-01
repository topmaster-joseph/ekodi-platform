import siteWorker from './site-worker.js';

const STAGING_SERVICE='ekodi-admin-staging';

function withStagingHeaders(response){
  const headers=new Headers(response.headers);
  headers.set('X-EKODI-Staging',STAGING_SERVICE);
  headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

// Admin modules declare their API origin as API='https://ekodi.kr'. On this
// staging host only, rewrite that single declaration to the staging origin so
// sessions and admin calls stay on staging. Production assets are unchanged.
const ADMIN_API_DECLARATION=/\bAPI(\s?)=(\s?)'https:\/\/ekodi\.kr'/g;
export async function isolateAdminApiOrigin(response){
  const type=response.headers.get('content-type')||'';
  if(!response.ok||!/javascript/i.test(type))return response;
  const source=await response.text();
  if(!ADMIN_API_DECLARATION.test(source))return new Response(source,response);
  ADMIN_API_DECLARATION.lastIndex=0;
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('etag');
  return new Response(source.replace(ADMIN_API_DECLARATION,'API$1=$2location.origin'),
    {status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env){
    const incoming=new URL(request.url);
    if(incoming.pathname==='/health'){
      return new Response(JSON.stringify({ok:true,service:STAGING_SERVICE,mode:'isolated-pr-staging',productionTraffic:false}),{
        headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ekodi-staging':STAGING_SERVICE}
      });
    }

    // Staging isolation (#6739): every /api/* call from the staging admin goes to
    // the isolated staging Control API (staging D1 sessions, development DB).
    // Without the binding, fail closed instead of reaching production.
    if(incoming.pathname==='/api'||incoming.pathname.startsWith('/api/')){
      if(!env.CONTROL_API){
        return withStagingHeaders(new Response(JSON.stringify({error:'staging_control_api_unbound'}),
          {status:503,headers:{'content-type':'application/json; charset=utf-8'}}));
      }
      return withStagingHeaders(await env.CONTROL_API.fetch(new Request(request)));
    }

    // Reuse the exact production admin routing/security contract while keeping the
    // deployment on a workers.dev staging hostname with no production custom domains.
    const adminUrl=new URL(request.url);
    adminUrl.protocol='https:';
    adminUrl.hostname='admin.ekodi.kr';
    adminUrl.port='';
    const stagedRequest=new Request(adminUrl,request);
    const response=await siteWorker.fetch(stagedRequest,env);
    return withStagingHeaders(await isolateAdminApiOrigin(response));
  }
};
