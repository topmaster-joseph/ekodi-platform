import growthWorker from './marketing-growth-worker.js';
import { getMallPromotionStatus, handleMallPromotionRequest, runMallPromotionAutomation } from './mall-promotion-automation.js';
import { getMallSalesIntelligenceStatus, runMallSalesIntelligence } from './mall-sales-intelligence.js';
import { getYoutubeGrowthStatus, handleYoutubeGrowthRequest } from './youtube-growth-adapter.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export default {
  async fetch(request, env, ctx) {
    const youtubeResponse = await handleYoutubeGrowthRequest(request, env);
    if (youtubeResponse) return youtubeResponse;
    const redirect = await handleMallPromotionRequest(request, env);
    if (redirect) return redirect;
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      const baseResponse = await growthWorker.fetch(request, env, ctx);
      let base = {};
      try { base = await baseResponse.clone().json(); } catch {}
      const [mallPromotionAutomation, mallSalesIntelligence] = await Promise.all([
        getMallPromotionStatus(env),
        getMallSalesIntelligenceStatus(env),
      ]);
      return json({...base, youtube:getYoutubeGrowthStatus(env), mallPromotionAutomation, mallSalesIntelligence}, baseResponse.status);
    }
    return growthWorker.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const intelligence = await runMallSalesIntelligence(env, {reason:'cron'});
      if (!intelligence.ok && intelligence.status !== 'schema_required') {
        console.error('EKODI Mall sales intelligence failed', intelligence.error || intelligence.status);
      }
      await runMallPromotionAutomation(env, {reason:'cron'});
    })());
  },
};
