import apiWorker from './api-worker.js';
import { handleCustomerAuth } from './customer-auth.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/customer/') || path.startsWith('/api/customers/')) {
      try {
        return await handleCustomerAuth(request, env);
      } catch (error) {
        console.error('Customer authentication API error', error);
        return new Response(JSON.stringify({
          error: '고객 인증 API 처리 중 오류가 발생했습니다.',
          code: 'CUSTOMER_AUTH_API_ERROR',
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
    return apiWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return apiWorker.scheduled(controller, env, ctx);
  },
};
