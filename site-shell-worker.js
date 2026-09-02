import siteWorker from './site-worker.js';
import { serviceForId } from './ekodi-service-manifest.js';
import { injectEkodiShell, injectEkodiUserUi, shellServiceForHost, shellServiceForRootPath } from './ekodi-shell-injector.js';

const PUBLIC_HOST='ekodi.kr';
const USER_SURFACES=new Set(['public','workspace']);

function shellEligibleHost(hostname){
  const host=String(hostname||'').toLowerCase();
  return host===PUBLIC_HOST||Boolean(shellServiceForHost(host));
}

function normalizedPath(pathname){
  const value=`/${String(pathname||'/').replace(/^\/+|\/+$/g,'')}`;
  return value==='/'?'/':value.toLowerCase();
}

function rootUserService(pathname){
  const path=normalizedPath(pathname);
  const canonical=shellServiceForRootPath(path);
  if(canonical)return canonical;
  const first=path.split('/').filter(Boolean)[0]||'';
  const service=serviceForId(first);
  if(!service||!USER_SURFACES.has(String(service.defaultSurface||'').toLowerCase()))return '';
  return service.id;
}

function rootInternalPath(pathname){
  const path=normalizedPath(pathname);
  return path==='/admin'||path==='/admin.html'||path.startsWith('/admin/');
}

function effectiveRequest(request, env) {
  const original = new URL(request.url);
  if (env?.ENVIRONMENT !== 'staging') return { request, host: original.hostname.toLowerCase() };
  const requested = String(request.headers.get('x-ekodi-staging-host') || '').trim().toLowerCase();
  if (!shellEligibleHost(requested)) return { request, host: original.hostname.toLowerCase() };
  const simulated = new URL(original);
  simulated.hostname = requested;
  const headers = new Headers(request.headers);
  headers.delete('x-ekodi-staging-host');
  return {
    request: new Request(simulated, {
      method: request.method,
      headers,
      body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      redirect: request.redirect,
    }),
    host: requested,
  };
}

export default {
  async fetch(request, env, ctx) {
    const effective = effectiveRequest(request, env);
    const response = await siteWorker.fetch(effective.request, env, ctx);
    if (effective.host === PUBLIC_HOST) {
      const pathname=new URL(effective.request.url).pathname;
      if(rootInternalPath(pathname))return response;
      const serviceId=rootUserService(pathname);
      if(serviceId)return injectEkodiShell(response,serviceId);
      return injectEkodiShell(response,'ekodi','public');
    }
    const serviceId = shellServiceForHost(effective.host);
    if (!serviceId) return response;
    return injectEkodiShell(response, serviceId);
  },
};
