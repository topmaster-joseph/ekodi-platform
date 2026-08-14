import { handleMarketingDomainRequest, runMarketingDomainSchedule } from './marketing-domain-control.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true, service: 'ekodi-marketing-domain-api', version: 1 });
    }
    if (path.startsWith('/api/marketing/domains')) {
      try {
        const response = await handleMarketingDomainRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI custom domain API error', error);
        return json({
          error: 'Marketing AI 도메인 연결 API 처리 중 오류가 발생했습니다.',
          code: 'MARKETING_DOMAIN_API_ERROR',
        }, 500);
      }
    }
    return json({ error: 'Marketing domain API endpoint not found' }, 404);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMarketingDomainSchedule(env).catch(error => console.error('Marketing domain schedule failed', error)));
  },
};
