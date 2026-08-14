import baseWorker from './customer-entry-worker.js';
import { handleSocialRegistry } from './social-registry-api.js';

function isSocialPath(pathname) {
  return pathname === '/api/social/registry' || pathname.startsWith('/api/control/social/');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isSocialPath(url.pathname) || (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/social/') || url.pathname.startsWith('/api/control/social/')))) {
      const response = await handleSocialRegistry(request, env);
      if (response) return response;
    }
    return baseWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === 'function') return baseWorker.scheduled(controller, env, ctx);
  }
};
