import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCloudflareWorkersAiProvider,
  getCloudflareWorkersAiProviderStatus,
  CLOUDFLARE_WORKERS_AI_DEFAULTS,
} from '../workers-ai-provider-adapter.js';

test('Workers AI provider is unavailable without the binding', () => {
  const provider = createCloudflareWorkersAiProvider({});
  const status = getCloudflareWorkersAiProviderStatus({});
  assert.equal(provider.available, false);
  assert.equal(status.configured, false);
  assert.equal(status.available, false);
  assert.equal(status.model, CLOUDFLARE_WORKERS_AI_DEFAULTS.model);
});

test('Workers AI provider calls the binding and returns normalized output', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: 'EKODI AI 연결 확인', id: 'cf-test-1' };
      },
    },
  };  const provider = createCloudflareWorkersAiProvider(env);
  const result = await provider.invoke({
    context: {
      message: '현재 연결 상태를 알려줘',
      page: { title: 'EKODI AI Gateway', section: 'ai-gateway', pathname: '/' },
      history: [{ role: 'user', text: '안녕' }],
    },
  });

  assert.equal(provider.available, true);
  assert.equal(result.text, 'EKODI AI 연결 확인');
  assert.equal(result.model, CLOUDFLARE_WORKERS_AI_DEFAULTS.model);
  assert.equal(result.responseId, 'cf-test-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, CLOUDFLARE_WORKERS_AI_DEFAULTS.model);
  assert.equal(Array.isArray(calls[0].input.messages), true);
  assert.equal(calls[0].input.max_tokens, 900);
});

test('Workers AI status exposes binding mode without credentials', () => {
  const status = getCloudflareWorkersAiProviderStatus({ AI: { run() {} } });
  assert.equal(status.configured, true);
  assert.equal(status.available, true);
  assert.equal(status.credentialMode, 'workers-ai-binding');
});
