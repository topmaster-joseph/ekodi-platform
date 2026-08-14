import customerEntryWorker from './customer-entry-worker.js';
import { handleMarketingDomainRequest, runMarketingDomainSchedule } from './marketing-domain-control.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/marketing/domains')) {
      try {
        const response = await handleMarketingDomainRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI custom domain API error', error);
        return new Response(JSON.stringify({
          error: 'Marketing AI 도메인 연결 API 처리 중 오류가 발생했습니다.',
          code: 'MARKETING_DOMAIN_API_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      }
    }
    return customerEntryWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runMarketingDomainSchedule(env).catch(error => console.error('Marketing domain schedule failed', error)));
    return customerEntryWorker.scheduled(controller, env, ctx);
  },
};
