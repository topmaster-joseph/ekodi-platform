import growthWorker from './marketing-growth-worker.js';
import { getMallPromotionStatus, handleMallPromotionRequest, runMallPromotionAutomation } from './mall-promotion-automation.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export default {
  async fetch(request, env, ctx) {
    const redirect = await handleMallPromotionRequest(request, env);
    if (redirect) return redirect;
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      const baseResponse = await growthWorker.fetch(request, env, ctx);
      let base = {};
      try { base = await baseResponse.clone().json(); } catch {}
      const mallPromotionAutomation = await getMallPromotionStatus(env);
      return json({...base, mallPromotionAutomation}, baseResponse.status);
    }
    return growthWorker.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMallPromotionAutomation(env, {reason:'cron'}));
  },
};
