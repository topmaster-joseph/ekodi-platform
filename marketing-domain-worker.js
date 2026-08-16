import { handleMarketingDomainRequest, runMarketingDomainSchedule } from './marketing-domain-control.js';
import { handleMarketingStoreWorkspaceRequest, runMarketingStoreWorkspaceSchedule } from './marketing-store-workspace.js';
import { handleMarketingStoreDomainRequest, runMarketingStoreDomainSchedule } from './marketing-store-domain.js';
import { handleMarketingAuthHandoffRequest, runMarketingAuthHandoffSchedule } from './marketing-auth-handoff.js';
import { handleMarketingPlanRuntimeRequest, runMarketingPlanRuntimeSchedule } from './marketing-plan-runtime.js';

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
      return json({
        ok: true,
        service: 'ekodi-marketing-domain-api',
        version: 4,
        authHandoff: 'httpOnly-cookie',
        planRuntime: 'server-enforced',
      });
    }
    if (path.startsWith('/api/marketing/handoff')) {
      try {
        const response = await handleMarketingAuthHandoffRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI secure handoff API error', error);
        return json({ error: 'Marketing AI 보안 로그인 연결 처리 중 오류가 발생했습니다.', code: 'MARKETING_AUTH_HANDOFF_API_ERROR' }, 500);
      }
    }
    if (path.startsWith('/api/marketing/runtime')) {
      try {
        const response = await handleMarketingPlanRuntimeRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI plan runtime API error', error);
        return json({ error: 'Marketing AI 이용등급·사용량 처리 중 오류가 발생했습니다.', code: 'MARKETING_PLAN_RUNTIME_API_ERROR' }, 500);
      }
    }
    if (path.startsWith('/api/marketing/workspace')) {
      try {
        const response = await handleMarketingStoreWorkspaceRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI store workspace API error', error);
        return json({ error: 'Marketing AI 점포 Workspace 처리 중 오류가 발생했습니다.', code: 'MARKETING_STORE_WORKSPACE_API_ERROR' }, 500);
      }
    }
    if (path.startsWith('/api/marketing/store-domains')) {
      try {
        const response = await handleMarketingStoreDomainRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI store custom domain API error', error);
        return json({ error: 'Marketing AI 점포 도메인 연결 API 처리 중 오류가 발생했습니다.', code: 'MARKETING_STORE_DOMAIN_API_ERROR' }, 500);
      }
    }
    if (path.startsWith('/api/marketing/domains')) {
      try {
        const response = await handleMarketingDomainRequest(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Marketing AI custom domain API error', error);
        return json({ error: 'Marketing AI 도메인 연결 API 처리 중 오류가 발생했습니다.', code: 'MARKETING_DOMAIN_API_ERROR' }, 500);
      }
    }
    return json({ error: 'Marketing domain API endpoint not found' }, 404);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(Promise.all([
      runMarketingDomainSchedule(env),
      runMarketingStoreWorkspaceSchedule(env),
      runMarketingStoreDomainSchedule(env),
      runMarketingAuthHandoffSchedule(env),
      runMarketingPlanRuntimeSchedule(env),
    ]).catch(error => console.error('Marketing domain schedule failed', error)));
  },
};
