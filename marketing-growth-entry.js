import growthWorker from './marketing-growth-worker.js';
import { getMallPromotionStatus, handleMallPromotionRequest, runMallPromotionAutomation } from './mall-promotion-automation.js';
import { getMallSalesIntelligenceStatus, runMallSalesIntelligence } from './mall-sales-intelligence.js';

function promotionAutomationEnabled(env) {
  return ['1','true','yes','on'].includes(String(env.MALL_PROMOTION_AUTOMATION_ENABLED || '').trim().toLowerCase());
}

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
      const [rawMallPromotionAutomation, mallSalesIntelligence] = await Promise.all([
        getMallPromotionStatus(env),
        getMallSalesIntelligenceStatus(env),
      ]);
      const enabled = promotionAutomationEnabled(env);
      const mallPromotionAutomation = {
        ...rawMallPromotionAutomation,
        enabled,
        scheduler: enabled && rawMallPromotionAutomation?.scheduler !== false,
        safetyGate: enabled ? 'explicitly_enabled' : 'youtube_connection_and_test_publish_required',
      };
      return json({...base, mallPromotionAutomation, mallSalesIntelligence}, baseResponse.status, baseResponse.headers);
    }
    return growthWorker.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const intelligence = await runMallSalesIntelligence(env, {reason:'cron'});
      if (!intelligence.ok && intelligence.status !== 'schema_required') {
        console.error('EKODI Mall sales intelligence failed', intelligence.error || intelligence.status);
      }
      if (!promotionAutomationEnabled(env)) return;
      await runMallPromotionAutomation(env, {reason:'cron'});
    })());
  },
};
