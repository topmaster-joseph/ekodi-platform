import platformRouter from './platform-router-entry-worker.js';
import {
  handleSiteOperatingStatusApi,
  maybeGateSiteOperatingStatus,
  registerSuccessfulWorkspaceRequest
} from './site-operating-status.js';
import { siteOperatingStatusWidgetSource } from './site-operating-status-widget.js';

const WIDGET_PATH = '/__ekodi/site-operating-status.js';

function isAdminPath(pathname) {
  return /(?:^|\/)admin(?:\/|$)/i.test(String(pathname || ''));
}

function widgetResponse() {
  return new Response(siteOperatingStatusWidgetSource(), {
    status: 200,
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function injectAdminWidget(response) {
  if (!response?.headers?.get('content-type')?.toLowerCase().includes('text/html')) return response;
  const html = await response.text();
  if (html.includes(WIDGET_PATH)) return new Response(html, response);
  const tag = `<script src="${WIDGET_PATH}" defer data-ekodi-site-operating-status></script>`;
  const updated = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${tag}</body>`) : `${html}${tag}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(updated, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === WIDGET_PATH && request.method === 'GET') return widgetResponse();

    const apiResponse = await handleSiteOperatingStatusApi(request, env);
    if (apiResponse) return apiResponse;

    const gated = await maybeGateSiteOperatingStatus(request, env);
    if (gated) return gated;

    const response = await platformRouter.fetch(request, env, ctx);
    await registerSuccessfulWorkspaceRequest(request, response, env, ctx);

    if (isAdminPath(url.pathname) && ['GET', 'HEAD'].includes(request.method) && request.method !== 'HEAD') {
      return injectAdminWidget(response);
    }
    return response;
  }
};
