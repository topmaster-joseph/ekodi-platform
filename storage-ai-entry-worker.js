import missionControl from './mission-control-entry-worker.js';
import { handleStorageGateway } from './storage-gateway.js';
import { handleExternalAiModuleGateway } from './external-ai-module-gateway.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function gatewayError(message, code) {
  return applyApiSecurityHeaders(new Response(JSON.stringify({ error: message, code }), {
    status: 500,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  }));
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const isStorage = path.startsWith('/api/storage/v1');
    const isAiModule = path.startsWith('/api/ai-modules/v1');

    if (!isStorage && !isAiModule) return missionControl.fetch(request, env, ctx);

    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;

    if (isStorage) {
      try {
        const response = await handleStorageGateway(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('Storage Gateway edge error', error);
        return gatewayError('EKODI Storage Gateway 처리 중 오류가 발생했습니다.', 'STORAGE_GATEWAY_EDGE_ERROR');
      }
    }

    if (isAiModule) {
      try {
        const response = await handleExternalAiModuleGateway(request, env);
        if (response) return applyApiSecurityHeaders(response);
      } catch (error) {
        console.error('External AI Module Gateway edge error', error);
        return gatewayError('EKODI AI Module Gateway 처리 중 오류가 발생했습니다.', 'AI_MODULE_GATEWAY_EDGE_ERROR');
      }
    }

    return missionControl.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof missionControl.scheduled === 'function') return missionControl.scheduled(controller, env, ctx);
    return undefined;
  },
};
