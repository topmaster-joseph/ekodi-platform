import aiControlWorker from './ai-control-worker.js';
import { handleWorkloadIngress } from './ai-control-workload-ingress.js';

export default {
  async fetch(request, env, ctx) {
    const workloadResponse = await handleWorkloadIngress(request, env);
    if (workloadResponse) return workloadResponse;
    return aiControlWorker.fetch(request, env, ctx);
  },
};
