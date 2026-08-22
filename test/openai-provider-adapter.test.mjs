import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiProvider, getOpenAiProviderStatus, OPENAI_PROVIDER_DEFAULTS } from '../openai-provider-adapter.js';

test('OpenAI provider stays unavailable without a server-side key', () => {
  const provider = createOpenAiProvider({}, { fetchImpl: async () => { throw new Error('must not run'); } });
  assert.equal(provider.id, 'openai');
  assert.equal(provider.available, false);
  assert.equal(provider.model, OPENAI_PROVIDER_DEFAULTS.model);
  const status = getOpenAiProviderStatus({});
  assert.deepEqual(status, {
    id: 'openai',
    configured: false,
    available: false,
    model: OPENAI_PROVIDER_DEFAULTS.model,
  });
});

test('OpenAI provider uses Responses API and redacts credentials from admin context', async () => {
  let observed = null;
  const provider = createOpenAiProvider({
    OPENAI_API_KEY: 'sk-proj-server-only-example-1234567890',
    OPENAI_MODEL: 'gpt-5.6-terra',
  }, {
    fetchImpl: async (url, init) => {
      observed = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        id: 'resp_ekodi_test',
        model: 'gpt-5.6-terra',
        output: [{ content: [{ type: 'output_text', text: '관리자 화면을 확인했습니다.' }] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await provider.invoke({
    taskName: 'admin-assist',
    context: {
      message: '상태를 설명해줘. api_key=super-secret-value',
      page: { section: 'health', title: 'System Health', pathname: '/', hash: '#health', ignored: 'do-not-send' },
      history: [
        { role: 'user', text: 'Bearer very-secret-bearer-token-1234567890' },
        { role: 'assistant', text: '확인하겠습니다.' },
      ],
    },
  });

  assert.equal(observed.url, 'https://api.openai.com/v1/responses');
  assert.equal(observed.init.method, 'POST');
  assert.equal(observed.init.headers.authorization, 'Bearer sk-proj-server-only-example-1234567890');
  assert.equal(observed.body.model, 'gpt-5.6-terra');
  assert.match(observed.body.instructions, /EKODI Admin AI/);
  assert.match(observed.body.input, /System Health/);
  assert.match(observed.body.input, /\[REDACTED\]/);
  assert.doesNotMatch(observed.body.input, /super-secret-value|very-secret-bearer-token/);
  assert.doesNotMatch(observed.body.input, /do-not-send/);
  assert.equal(result.text, '관리자 화면을 확인했습니다.');
  assert.equal(result.responseId, 'resp_ekodi_test');
});

test('provider status never exposes OPENAI_API_KEY', () => {
  const status = getOpenAiProviderStatus({
    OPENAI_API_KEY: 'sk-proj-never-return-this-1234567890',
    OPENAI_MODEL: 'gpt-5.6-terra',
  });
  const serialized = JSON.stringify(status);
  assert.equal(status.configured, true);
  assert.equal(status.available, true);
  assert.doesNotMatch(serialized, /sk-proj|never-return-this/);
});
