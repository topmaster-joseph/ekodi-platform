import { handleSiteBoardRequest } from './site-board-control.js';

// No external route or workers.dev endpoint: invoked only by an authorized Service Binding.
// Do not reuse the static-assets Worker for board requests; its SPA fallback can return
// HTTP 200 without an independent-board identity, which the CGMA edge must reject.
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.hostname!=='board.internal.ekodi'||!/^\/cgma\/board(?:\/|$)/i.test(url.pathname)){
      return new Response('Not Found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    }
    const response=await handleSiteBoardRequest(request,env);
    if(!response)return new Response('Not Found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    response.headers.set('cache-control','no-store');
    response.headers.set('x-content-type-options','nosniff');
    return response;
  },
};
