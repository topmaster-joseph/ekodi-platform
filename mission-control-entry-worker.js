import customerEntryWorker from './customer-entry-worker.js';
import { handleAgentMissionControl } from './ai-agent-control.js';
import { handleDeviceControl } from './device-control.js';
import { handleMarketingAdminControl } from './marketing-admin-control.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function errorResponse(message, code) {
  return applyApiSecurityHeaders(new Response(JSON.stringify({ error:message, code }), {
    status:500,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  }));
}

export default {
  async fetch(request, env, ctx) {
    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;

    const path = new URL(request.url).pathname;
    // MarketingAI Operations Console is a read-only control-plane surface. Keep it
    // ahead of the shared customer router so admin auth and API security stay explicit.
    if (path.startsWith('/api/marketing/admin/')) {
      try {
        const response = await handleMarketingAdminControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Marketing AI admin control error', error);
        return errorResponse('Marketing AI 운영 API 처리 중 오류가 발생했습니다.', 'MARKETING_ADMIN_CONTROL_ERROR');
      }
    }

    if (path.startsWith('/api/control/devices') || path.startsWith('/api/device-agent')) {
      try {
        const response = await handleDeviceControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Device Control error', error);
        return errorResponse('Device Control 처리 중 오류가 발생했습니다.', 'DEVICE_CONTROL_ERROR');
      }
    }

    if (path.startsWith('/api/control/ai/')) {
      try {
        const response = await handleAgentMissionControl(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('AI Mission Control error', error);
        return errorResponse('AI Mission Control 처리 중 오류가 발생했습니다.', 'AI_MISSION_CONTROL_ERROR');
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
