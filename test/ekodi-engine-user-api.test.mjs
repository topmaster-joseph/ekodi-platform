import test from 'node:test';
import assert from 'node:assert/strict';
import { handleUserAiControl } from '../user-ai-control.js';

function mockDb() {
  return {
    async batch() { return []; },
    prepare() { return { bind() { return this; } }; },
  };
}

function identityFetch(url) {
  const value = String(url);
  if (value.includes('/auth/v1/user')) {
    return Promise.resolve(new Response(JSON.stringify({
      id:'auth-user-1', email:'person@example.com', email_confirmed_at:'2026-09-08T00:00:00Z',
    }), { status:200, headers:{ 'content-type':'application/json' } }));
  }
  if (value.includes('/rest/v1/rpc/current_ekodi_identity')) {
    return Promise.resolve(new Response(JSON.stringify({
      person_id:'person-1', ekodi_id:'ekodi-person-1', login_provider:'google', canonical:true,
    }), { status:200, headers:{ 'content-type':'application/json' } }));
  }
  throw new Error(`unexpected fetch ${value}`);
}

test('authenticated User AI plan endpoint exposes deterministic EKODI Engine plan without model call', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = identityFetch;
  try {
    const request = new Request('https://api.ekodi.kr/api/user-ai/plan', {
      method:'POST',
      headers:{ authorization:'Bearer test-token', 'content-type':'application/json' },
      body:JSON.stringify({ text:'이 주제와 연결되는 음악을 듣고 싶어' }),
    });    const response = await handleUserAiControl(request, { DB:mockDb() });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.plan.engine, 'ekodi-engine');
    assert.equal(payload.plan.selectedModules[0].id, 'culture.music');
    assert.equal(payload.plan.character.character.id, 'ekodian');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('User AI plan endpoint returns STOP when the user is ready to live it out', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = identityFetch;
  try {
    const request = new Request('https://api.ekodi.kr/api/user-ai/plan', {
      method:'POST',
      headers:{ authorization:'Bearer test-token', 'content-type':'application/json' },
      body:JSON.stringify({
        text:'이제 충분히 생각했어', readyToLive:true, contentConsumed:5, reflectionCompleted:true,
      }),
    });
    const response = await handleUserAiControl(request, { DB:mockDb() });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.plan.journey.phase, 'diaspora');
    assert.equal(payload.plan.nextMove.primary, 'STOP');
    assert.deepEqual(payload.plan.nextMove.secondary, ['PRACTICE']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
