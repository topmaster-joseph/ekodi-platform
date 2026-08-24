import siteWorker from './site-worker.js';
import { injectEkodiShell, shellServiceForHost } from './ekodi-shell-injector.js';

const SHELL_HOSTS = new Set([
  'trade.ekodi.kr',
  'trade.biz.ekodi.kr',
  'pay.ekodi.kr',
  'pay.biz.ekodi.kr',
  'mail.ekodi.kr',
  'mail.biz.ekodi.kr',
  'mail.church.ekodi.kr',
  'live.ekodi.kr',
  'live.biz.ekodi.kr',
  'live.church.ekodi.kr',
  'live.lab.ekodi.kr',
  'cloud.ekodi.kr',
  'ins.ekodi.kr',
  'media.ekodi.kr'
]);

function effectiveRequest(request, env) {
  const original = new URL(request.url);
  if (env?.ENVIRONMENT !== 'staging') return { request, host: original.hostname.toLowerCase() };
  const requested = String(request.headers.get('x-ekodi-staging-host') || '').trim().toLowerCase();
  if (!SHELL_HOSTS.has(requested)) return { request, host: original.hostname.toLowerCase() };
  const simulated = new URL(original);
  simulated.hostname = requested;
  const headers = new Headers(request.headers);
  headers.delete('x-ekodi-staging-host');
  return { request: new Request(simulated, { method: request.method, headers, body: ['GET','HEAD'].includes(request.method) ? undefined : request.body, redirect: request.redirect }), host: requested };
}

export default {
  async fetch(request, env, ctx) {
    const effective = effectiveRequest(request, env);
    const response = await siteWorker.fetch(effective.request, env, ctx);
    if (!SHELL_HOSTS.has(effective.host)) return response;
    const serviceId = shellServiceForHost(effective.host);
    if (!serviceId) return response;
    return injectEkodiShell(response, serviceId);
  },
};
