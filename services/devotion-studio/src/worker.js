import { createDevotionStudio } from './service.js';
import { createDevotionStudioHttpHandler } from './http-handler.js';
import { createD1Repository } from './adapters/d1-repository.js';
import { createHttpRenderer } from './adapters/http-renderer.js';
import { createHttpPublisher } from './adapters/http-publisher.js';

export default {
  async fetch(request, env) {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'repository not configured', code: 'REPOSITORY_NOT_CONFIGURED' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    const repository = createD1Repository(env.DB);
    const renderer = createHttpRenderer({ endpoint: env.RENDER_ENDPOINT, token: env.RENDER_TOKEN });
    const publisher = createHttpPublisher({ endpoint: env.PUBLISHER_ENDPOINT, token: env.PUBLISHER_TOKEN });
    const service = createDevotionStudio({ repository, renderer, publisher });
    const handle = createDevotionStudioHttpHandler({ service, serviceKey: env.SERVICE_KEY || '' });
    return handle(request);
  }
};
