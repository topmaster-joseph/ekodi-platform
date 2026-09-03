import growthWorker from './marketing-growth-worker.js';
import { getMallPromotionStatus, handleMallPromotionRequest, runMallPromotionAutomation } from './mall-promotion-automation.js';
import { getMallSalesIntelligenceStatus, runMallSalesIntelligence } from './mall-sales-intelligence.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

function secureEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function runActiveSalesCycle(env, reason) {
  const intelligence = await runMallSalesIntelligence(env, {reason});
  if (!intelligence.ok && intelligence.status !== 'schema_required') {
    console.error('EKODI Mall sales intelligence failed', intelligence.error || intelligence.status);
  }
  const promotion = await runMallPromotionAutomation(env, {reason});
  return {
    ok: intelligence.ok !== false && promotion?.ok !== false,
    reason,
    ranAt: new Date().toISOString(),
    intelligence,
    promotion,
  };
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
      const [mallPromotionAutomation, mallSalesIntelligence] = await Promise.all([
        getMallPromotionStatus(env),
        getMallSalesIntelligenceStatus(env),
      ]);
      return json({...base, mallPromotionAutomation, mallSalesIntelligence}, baseResponse.status);
    }
    if (url.pathname === '/internal/active-sales/run' && request.method === 'POST') {
      const expected = String(env.MARKETING_GROWTH_SCHEDULER_TOKEN || '').trim();
      const supplied = String(request.headers.get('x-ekodi-scheduler-token') || '').trim();
      if (!expected || !secureEqual(expected, supplied)) return json({ok:false,error:'unauthorized'}, 401);
      try {
        return json(await runActiveSalesCycle(env, 'github_schedule'));
      } catch (error) {
        console.error('EKODI Mall active sales cycle failed', error);
        return json({ok:false,error:'active_sales_cycle_failed'}, 500);
      }
    }
    return growthWorker.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runActiveSalesCycle(env, 'cloudflare_cron'));
  },
};
