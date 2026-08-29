import coreWorker, { RevenueStore } from './ekodibiz-worker.js';

export { RevenueStore };

const LEGACY_PAYMENT_URL = 'https://pay.ekodi.kr';
const CANONICAL_PAYMENT_URL = 'https://pay.biz.ekodi.kr';

async function normalizePaymentGateway(response) {
  const headers = new Headers(response.headers);
  const csp = headers.get('content-security-policy');
  if (csp) headers.set('content-security-policy', csp.replaceAll(LEGACY_PAYMENT_URL, CANONICAL_PAYMENT_URL));

  const contentType = headers.get('content-type') || '';
  const isText = contentType.includes('application/json') || contentType.startsWith('text/');
  if (!response.body || !isText) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const body = (await response.text()).replaceAll(LEGACY_PAYMENT_URL, CANONICAL_PAYMENT_URL);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const response = await coreWorker.fetch(request, env, ctx);
    return normalizePaymentGateway(response);
  },

  async scheduled(event, env, ctx) {
    if (typeof coreWorker.scheduled === 'function') return coreWorker.scheduled(event, env, ctx);
  }
};
