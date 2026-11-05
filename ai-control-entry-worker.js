import { WorkerEntrypoint } from 'cloudflare:workers';
import aiControlWorker from './ai-control-worker.js';
import { writeForPublishing } from './ai-control-publishing-writer.js';
import { handleWorkloadIngress } from './ai-control-workload-ingress.js';

export default {
  async fetch(request, env, ctx) {
    const workloadResponse = await handleWorkloadIngress(request, env);
    if (workloadResponse) return workloadResponse;
    return aiControlWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof aiControlWorker.scheduled !== 'function') return;
    return aiControlWorker.scheduled(controller, env, ctx);
  },
};

// PUBLISHING-AI-VIA-CONTROL-001: 출판 워커 전용 이름 있는 진입점(서비스 바인딩으로만 호출, 공개 경로 없음).
// 무료 AI만 쓰고 하루 호출 상한을 지킨다. 유료 자동 전환 없음.
export class PublishingWriter extends WorkerEntrypoint {
  async write(input) {
    return writeForPublishing(this.env, input);
  }
}
