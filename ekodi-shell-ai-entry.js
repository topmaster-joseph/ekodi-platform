import shellWorker from './ekodi-shell-worker.js';

function withLauncherHeaders(response,installed){
  const headers=new Headers(response.headers);
  headers.set('x-ekodi-ai-launcher',installed?'v1':'missing');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await shellWorker.fetch(request,env,ctx);
    if(url.pathname!=='/shell.js'||request.method!=='GET'||!response.ok)return response;
    try{
      const launcherUrl=new URL(request.url);launcherUrl.pathname='/ai-launcher.js';launcherUrl.search='';
      const launcherResponse=await env.ASSETS.fetch(new Request(launcherUrl,{method:'GET'}));
      if(!launcherResponse.ok)return withLauncherHeaders(response,false);
      const [shell,launcher]=await Promise.all([response.text(),launcherResponse.text()]);
      const headers=new Headers(response.headers);
      headers.set('content-type','application/javascript; charset=utf-8');
      headers.set('cache-control','public, max-age=60, stale-while-revalidate=300');
      headers.set('x-ekodi-ai-launcher','v1');
      return new Response(`${shell}\n${launcher}\n`,{status:200,headers});
    }catch(error){
      console.error('ai launcher bundle',error);
      return withLauncherHeaders(response,false);
    }
  }
};
