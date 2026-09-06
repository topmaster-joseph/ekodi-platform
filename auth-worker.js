import authCore from './auth-worker-core.js';
import { handleAuthProviderPolicy } from './auth-provider-policy.js';
import { handleChurchParticipation } from './church-participation-control.js';

export * from './auth-worker-core.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/church/participation') || url.pathname.startsWith('/api/church/admin/participation')) {
      try {
        const response = await handleChurchParticipation(request, env);
        if (response) return response;
      } catch (error) {
        console.error('Church participation API error', error);
        return new Response(JSON.stringify({ error: '교회 참여 API 처리 중 오류가 발생했습니다.', code: 'CHURCH_PARTICIPATION_ERROR' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        });
      }
    }
    const policyResponse = await handleAuthProviderPolicy(request, env, ctx, authCore);
    if (policyResponse) return policyResponse;
    return authCore.fetch(request, env, ctx);
  }
};