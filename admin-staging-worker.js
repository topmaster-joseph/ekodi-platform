import siteWorker from './site-worker.js';

const STAGING_SERVICE = 'ekodi-admin-staging';
const CANONICAL_ENTRY = 'https://admin.ekodi.kr/ekodi.index';
const EMERGENCY_PATH = '/emergency';

function withStagingHeaders(response, mode = 'emergency') {
  const headers = new Headers(response.headers);
  headers.set('X-EKODI-Staging', STAGING_SERVICE);
  headers.set('X-EKODI-Failover', mode);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function canonicalHealthy() {
  try {
    const response = await fetch(CANONICAL_ENTRY, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'cache-control': 'no-cache',
        'user-agent': 'EKODI-Smart-Admin-Gateway/1.0',
      },
      signal: AbortSignal.timeout(3500),
    });
    return response.status === 200
      && response.headers.get('x-ekodi-route') === 'admin-control-center'
      && response.headers.get('x-ekodi-entry') === 'ekodi.index';
  } catch {
    return false;
  }
}

async function serveEmergency(request, env) {
  const adminUrl = new URL(request.url);
  adminUrl.protocol = 'https:';
  adminUrl.hostname = 'admin.ekodi.kr';
  adminUrl.port = '';
  adminUrl.pathname = '/';
  const stagedRequest = new Request(adminUrl, request);
  const response = await siteWorker.fetch(stagedRequest, env);
  return withStagingHeaders(response, 'emergency-local');
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    if (incoming.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        service: STAGING_SERVICE,
        mode: 'smart-gateway-emergency',
        productionTraffic: false,
        canonicalEntry: CANONICAL_ENTRY,
        emergencyPath: EMERGENCY_PATH,
      }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-ekodi-staging': STAGING_SERVICE,
        },
      });
    }

    if (incoming.pathname === EMERGENCY_PATH || incoming.pathname === '/emergency/') {
      return serveEmergency(request, env);
    }

    if (incoming.pathname === '/' || incoming.pathname === '/ekodi.index') {
      if (await canonicalHealthy()) {
        const response = Response.redirect(CANONICAL_ENTRY, 302);
        return withStagingHeaders(response, 'primary');
      }
      return serveEmergency(request, env);
    }

    return serveEmergency(request, env);
  },
};
