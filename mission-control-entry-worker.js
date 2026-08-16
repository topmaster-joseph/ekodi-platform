import customerEntryWorker from './customer-entry-worker.js';
import { handleAgentMissionControl } from './ai-agent-control.js';
import { handleDeviceControl } from './device-control.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

export default {
  async fetch(request, env, ctx) {
    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;

    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/control/devices') || path.startsWith('/api/device-agent')) {
      try {
        const response = await handleDeviceControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Device Control error', error);
        return applyApiSecurityHeaders(new Response(JSON.stringify({
          error: 'Device Control 처리 중 오류가 발생했습니다.',
          code: 'DEVICE_CONTROL_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        }));
      }
    }

    if (path.startsWith('/api/control/ai/')) {
      try {
        const response = await handleAgentMissionControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('AI Mission Control error', error);
        return applyApiSecurityHeaders(new Response(JSON.stringify({
          error: 'AI Mission Control 처리 중 오류가 발생했습니다.',
          code: 'AI_MISSION_CONTROL_ERROR',
        }), {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        }));
      }
    }

    const response = await customerEntryWorker.fetch(request, env, ctx);
    return applyApiSecurityHeaders(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof customerEntryWorker.scheduled === 'function') {
      return customerEntryWorker.scheduled(controller, env, ctx);
    }
  },
};
