import socialWorker from './social-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

export default {
  async fetch(request, env, ctx) {
    return injectEkodiShell(await socialWorker.fetch(request, env, ctx), 'social');
  },
};
