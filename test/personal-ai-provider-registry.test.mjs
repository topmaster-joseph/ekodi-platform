import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPersonalProvider,
  firstConnectionGuide,
  personalAiProviders,
  personalApiProviderIds,
  validatePersonalApiKey,
} from '../personal-ai-provider-registry.js';

test('registry exposes Gemini via Google AI Studio, OpenAI and Claude personal APIs', () => {
  const ids = personalApiProviderIds();
  assert.deepEqual(ids, ['gemini-api', 'openai-api', 'claude-api']);
  const providers = personalAiProviders();
  assert.equal(providers.find(item => item.id === 'gemini-api')?.label, 'Google AI Studio · Gemini');
  assert.equal(providers.find(item => item.id === 'claude-api')?.label, 'Claude API');
  assert.ok(providers.some(item => item.id === 'claude-web'));
});

test('first connection guide disappears as soon as any personal API is connected', () => {
  assert.ok(firstConnectionGuide([]));
  assert.equal(firstConnectionGuide(['gemini-api']), null);
  assert.equal(firstConnectionGuide(['openai-api']), null);
  assert.equal(firstConnectionGuide(['claude-api']), null);
});

test('provider key validators reject obviously wrong provider key shapes', () => {
  assert.equal(validatePersonalApiKey('openai-api', 'not-an-openai-key-abcdefghijklmnopqrstuvwxyz').ok, false);
  assert.equal(validatePersonalApiKey('claude-api', 'sk-not-claude-abcdefghijklmnopqrstuvwxyz').ok, false);
  assert.equal(validatePersonalApiKey('gemini-api', 'gemini-key-abcdefghijklmnopqrstuvwxyz').ok, true);
});

test('personal OpenAI adapter keeps key out of request body and disables response storage', async () => {
  let request = null;
  const provider = createPersonalProvider('openai-api', {
    apiKey:'sk-proj-test-key-abcdefghijklmnopqrstuvwxyz',
    fetchImpl:async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ id:'resp_personal', model:'gpt-test', output_text:'개인 OpenAI 응답' }), { status:200, headers:{ 'content-type':'application/json' } });
    },
  });
  const result = await provider.invoke({ message:'안녕하세요' });
  const body = JSON.parse(request.options.body);
  assert.equal(result.text, '개인 OpenAI 응답');
  assert.equal(body.store, false);
  assert.equal(JSON.stringify(body).includes('sk-proj-test-key'), false);
  assert.match(request.options.headers.authorization, /^Bearer /);
});

test('personal Claude adapter uses x-api-key header and keeps key out of body', async () => {
  let request = null;
  const provider = createPersonalProvider('claude-api', {
    apiKey:'sk-ant-test-key-abcdefghijklmnopqrstuvwxyz',
    fetchImpl:async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ id:'msg_test', model:'claude-test', content:[{ type:'text', text:'개인 Claude 응답' }] }), { status:200, headers:{ 'content-type':'application/json' } });
    },
  });
  const result = await provider.invoke({ message:'안녕하세요' });
  assert.equal(result.text, '개인 Claude 응답');
  assert.equal(request.options.headers['x-api-key'], 'sk-ant-test-key-abcdefghijklmnopqrstuvwxyz');
  assert.equal(request.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.stringify(JSON.parse(request.options.body)).includes('sk-ant-test-key'), false);
});
