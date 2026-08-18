import siteWorker from './site-worker.js';

const ADMIN_ENTRY_PATH = '/ekodi.index';
const ADMIN_ENTRY_HOSTS = new Set([
  'admin.ekodi.kr',
  'admin.biz.ekodi.kr',
  'admin.church.ekodi.kr',
  'admin.lab.ekodi.kr',
  'admin.trade.ekodi.kr',
]);

function withEntryHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('X-EKODI-Entry', 'ekodi.index');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (ADMIN_ENTRY_HOSTS.has(host) && url.pathname === ADMIN_ENTRY_PATH) {
      const internalUrl = new URL(request.url);
      internalUrl.pathname = '/';
      const internalRequest = new Request(internalUrl, request);
      const response = await siteWorker.fetch(internalRequest, env);
      return withEntryHeader(response);
    }

    const response = await siteWorker.fetch(request, env);
    if (ADMIN_ENTRY_HOSTS.has(host) && (url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/')) {
      return withEntryHeader(response);
    }
    return response;
  },
};
