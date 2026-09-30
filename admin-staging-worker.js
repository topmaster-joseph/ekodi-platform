import siteWorker from './site-worker.js';

const STAGING_SERVICE='ekodi-admin-staging';

function withStagingHeaders(response){
  const headers=new Headers(response.headers);
  headers.set('X-EKODI-Staging',STAGING_SERVICE);
  headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env){
    const incoming=new URL(request.url);
    if(incoming.pathname==='/health'){
      return new Response(JSON.stringify({ok:true,service:STAGING_SERVICE,mode:'isolated-pr-staging',productionTraffic:false}),{
        headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ekodi-staging':STAGING_SERVICE}
      });
    }

    // Reuse the exact production admin routing/security contract while keeping the
    // deployment on a workers.dev staging hostname with no production custom domains.
    const adminUrl=new URL(request.url);
    adminUrl.protocol='https:';
    adminUrl.hostname='admin.ekodi.kr';
    adminUrl.port='';
    const stagedRequest=new Request(adminUrl,request);
    const response=await siteWorker.fetch(stagedRequest,env);
    return withStagingHeaders(response);
  }
};
