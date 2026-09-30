import energyWorker from './energy-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

export default {
  async fetch(request, env, ctx) {
    return injectEkodiShell(await energyWorker.fetch(request, env, ctx), 'energy');
  },
};
