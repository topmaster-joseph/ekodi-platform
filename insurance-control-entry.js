import apiWorker from './api-worker.js';
import { handleInsuranceAdminProxy, INSURANCE_ADMIN_PREFIX } from './insurance-control-proxy.js';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith(INSURANCE_ADMIN_PREFIX)){
      try{return await handleInsuranceAdminProxy(request,env,ctx,apiWorker)}
      catch(error){console.error('Insurance admin proxy',error);return new Response(JSON.stringify({error:'insurance_admin_proxy_failed'}),{status:500,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
    }
    return apiWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(typeof apiWorker.scheduled==='function')return apiWorker.scheduled(controller,env,ctx);
  }
};
