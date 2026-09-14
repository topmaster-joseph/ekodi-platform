import growthWorker from './marketing-growth-worker.js';
export { MarketingGrowthPublisher } from './marketing-growth-worker.js';
import { getMallPromotionStatus, handleMallPromotionRequest, mallPromotionAutomationEnabled } from './mall-promotion-automation.js';
import { getMallSalesIntelligenceStatus } from './mall-sales-intelligence.js';
import { getMallAutonomousProfitLoopStatus, runMallAutonomousProfitLoop } from './mall-autonomous-profit-loop.js';

function json(data, status = 200, inheritedHeaders = null) {
  const headers = new Headers(inheritedHeaders || undefined);
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-content-type-options','nosniff');
  return new Response(JSON.stringify(data), {status, headers});
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
      const [rawMallPromotionAutomation, mallSalesIntelligence, mallAutonomousProfitLoop] = await Promise.all([
        getMallPromotionStatus(env),
        getMallSalesIntelligenceStatus(env),
        getMallAutonomousProfitLoopStatus(env),
      ]);
      const enabled = mallPromotionAutomationEnabled(env);
      const mallPromotionAutomation = {
        ...rawMallPromotionAutomation,
        enabled,
        scheduler: enabled && rawMallPromotionAutomation?.scheduler !== false,
        safetyGate: enabled ? 'explicitly_enabled' : 'social_oauth_connection_and_test_publish_required',
      };
      return json({...base, mallPromotionAutomation, mallSalesIntelligence, mallAutonomousProfitLoop}, baseResponse.status, baseResponse.headers);
    }
    return growthWorker.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const loop = await runMallAutonomousProfitLoop(env,{reason:'cron'});
      if (!loop.ok) console.error('EKODI Mall autonomous profit loop degraded', loop.after?.state || 'failed');
    })());
  },
};
