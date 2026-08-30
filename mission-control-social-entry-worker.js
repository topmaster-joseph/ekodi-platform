import missionControlWorker from './mission-control-entry-worker.js';
import { handleSocialChannelGateway, processScheduledSocialPosts } from './social-channel-gateway.js';
import { handleSocialContentAi } from './social-content-ai.js';
import { handleSocialAttribution } from './social-attribution-api.js';
import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js';

function socialPath(path) {
  return path.startsWith('/api/control/social/') ||
    path.startsWith('/api/social/oauth/') ||
    path === '/api/social/events' ||
    path === '/api/social/attribution';
}

function allowedOrigin(request, env = {}) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return '';
  const allowed = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : '';
}

function preflight(request, env) {
  if (request.method !== 'OPTIONS') return null;
  const path = new URL(request.url).pathname;
  if (!socialPath(path) || path === '/api/social/attribution') return null;
  const origin = allowedOrigin(request, env);
  if (!origin) {
    return applyApiSecurityHeaders(new Response(JSON.stringify({ error: '허용되지 않은 Origin입니다.', code: 'ORIGIN_FORBIDDEN' }), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'vary': 'Origin' },
    }));
  }
  return applyApiSecurityHeaders(new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
      'cache-control': 'no-store',
      'vary': 'Origin',
    },
  }));
}

function socialError(error) {
  console.error('Social Channel Gateway error', error);
  return applyApiSecurityHeaders(new Response(JSON.stringify({
    error: '소셜 채널 처리 중 오류가 발생했습니다.',
    code: 'SOCIAL_CHANNEL_GATEWAY_ERROR',
  }), {
    status: 500,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  }));
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (!socialPath(path)) return missionControlWorker.fetch(request, env, ctx);

    const guard = await enforceEdgeSecurity(request, env);
    if (guard) return guard;

    try {
      if (path === '/api/social/attribution') {
        const attribution = await handleSocialAttribution(request, env);
        if (attribution) return applyApiSecurityHeaders(attribution);
      }

      const cors = preflight(request, env);
      if (cors) return cors;

      if (path === '/api/control/social/content/generate') {
        const ai = await handleSocialContentAi(request, env);
        if (ai) return applyApiSecurityHeaders(ai);
      }
      const response = await handleSocialChannelGateway(request, env);
      if (response) {
        const origin = allowedOrigin(request, env);
        if (origin) {
          response.headers.set('access-control-allow-origin', origin);
          response.headers.set('vary', 'Origin');
        }
        return applyApiSecurityHeaders(response);
      }
    } catch (error) {
      return socialError(error);
    }

    return missionControlWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const socialPublishing = processScheduledSocialPosts(env, 8)
      .catch(error => {
        console.error('Scheduled social publishing error', error);
        return [{ ok: false, error: 'scheduled_social_publishing_failed' }];
      });

    if (ctx?.waitUntil) ctx.waitUntil(socialPublishing);
    const baseSchedule = typeof missionControlWorker.scheduled === 'function'
      ? missionControlWorker.scheduled(controller, env, ctx)
      : null;

    if (baseSchedule && typeof baseSchedule.then === 'function') return Promise.all([baseSchedule, socialPublishing]);
    return socialPublishing;
  },
};
