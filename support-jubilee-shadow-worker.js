import { buildSupportJubileeSignalRequest } from './support-jubilee-boundary.js';
import { executeJubileeCapabilityRequest } from './jubilee-capability-provider.js';

const HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
});

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: HEADERS });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const shadow = env.ENVIRONMENT === 'development' && env.JUBILEE_MODE === 'shadow';

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'ekodi-support-jubilee-shadow',
        mode: shadow ? 'shadow' : 'off',
        productionExecution: false,
        supportNeedScoreShared: false,
        beneficiaryIdentityShared: false,
      });
    }
    if (url.pathname === '/preview' && request.method === 'POST') {
      if (!shadow) return json({ error: 'not_found' }, 404);
      const body = await readJson(request);
      if (!body) return json({ error: 'invalid_json' }, 400);

      try {
        const envelope = buildSupportJubileeSignalRequest({
          requestId: body.requestId || `support-jubilee-${crypto.randomUUID()}`,
          consent: body.consent,
          jubileeConsent: body.jubileeConsent,
          assessment: body.assessment || {},
        });
        const result = await executeJubileeCapabilityRequest(envelope);
        return json({ mode: 'shadow', result }, result.status === 'ok' ? 200 : 422);
      } catch (error) {
        return json({
          error: 'jubilee_preview_rejected',
          code: String(error?.message || 'rejected').slice(0, 160),
        }, 400);
      }
    }

    return json({ error: 'not_found' }, 404);
  },
};
