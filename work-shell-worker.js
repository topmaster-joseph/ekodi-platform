import workWorker from './work-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

export default {
  async fetch(request, env, ctx) {
    return injectEkodiShell(await workWorker.fetch(request, env, ctx), 'work');
  },
};
