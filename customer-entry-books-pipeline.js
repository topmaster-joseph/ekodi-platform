import baseWorker from './customer-entry-worker.js';
import { handleBooksPipelineRequest } from './books-pipeline-control.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'OPTIONS' && path.startsWith('/api/books/admin/pipeline')) {
      try {
        const response = await handleBooksPipelineRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Books pipeline API error', error);
        return new Response(JSON.stringify({
          error: '출판 통합 파이프라인 API 처리 중 오류가 발생했습니다.',
          code: 'BOOKS_PIPELINE_API_ERROR',
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
    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof baseWorker.scheduled === 'function') return baseWorker.scheduled(event, env, ctx);
  },
};
