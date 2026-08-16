import customerEntryWorker from './customer-entry-worker.js';
import { handleAgentMissionControl } from './ai-agent-control.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/control/ai/')) {
      try {
        const response = await handleAgentMissionControl(request, env);
        if (response) return response;
      } catch (error) {
        console.error('AI Mission Control error', error);
        return new Response(JSON.stringify({
          error: 'AI Mission Control 처리 중 오류가 발생했습니다.',
          code: 'AI_MISSION_CONTROL_ERROR',
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
    if (typeof customerEntryWorker.scheduled === 'function') {
      return customerEntryWorker.scheduled(controller, env, ctx);
    }
  },
};
