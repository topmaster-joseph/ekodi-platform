import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleExternalAiModuleGateway,
  resetExternalAiModuleCircuitsForTest,
} from '../external-ai-module-gateway.js';

const API = 'https://api.ekodi.kr/api/ai-modules/v1/execute';

function envFor(manifest = {}) {
  return {
    EKODI_AI_MODULE_GATEWAY_KEY: 'gateway-secret',
    EKODI_AI_MODULE_CALLERS: 'marketing-service',
    EKODI_AI_MODULE_REGISTRY_JSON: JSON.stringify([{
      id: 'vendor.marketing-ai',
      name: 'Vendor Marketing AI',
      version: '1.0.0',
      endpoint: 'https://vendor.example.com',
      capabilities: ['marketing.campaign'],
      secretBinding: 'VENDOR_SECRET',
      enabled: true,
      ...manifest,
    }]),
    VENDOR_SECRET: 'vendor-secret',
  };
}

function body() {
  return {
    moduleId: 'vendor.marketing-ai',
    capability: 'marketing.campaign',
    context: {
      spaceId: 'jadam',
      serviceId: 'marketing',
      actorId: 'user-12345',
      role: 'owner',
      capabilities: ['marketing.campaign'],
    },
    input: {
      goal: 'increase repeat visits',
      email: 'owner@example.com',
      apiKey: 'sk-proj-THIS_SHOULD_NEVER_LEAVE_EKODI',
    },
  };
}

function request(payload = body(), headers = {}) {
  return new Request(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ekodi-ai-gateway-key': 'gateway-secret',
      'x-ekodi-caller-id': 'marketing-service',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await fn(); }
  finally { globalThis.fetch = original; }
}

test('external AI gateway sends only projected context with short-lived capability grant', async () => {
  resetExternalAiModuleCircuitsForTest();
  let seen;
  await withFetch(async (_url, init) => {
    seen = { headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      contractVersion: '1.0.0',
      requestId: seen.body.requestId,
      ok: true,
      output: { campaign: 'ready' },
      meta: { model: 'vendor-model' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const response = await handleExternalAiModuleGateway(request(), envFor());
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.guardrailPolicyVersion, '2026-09-08');
  });

  assert.equal(seen.headers['x-ekodi-idempotency-key'], seen.body.requestId);
  assert.equal(seen.body.capabilityGrant.audience, 'vendor.marketing-ai');
  assert.equal(seen.body.capabilityGrant.capability, 'marketing.campaign');
  assert.equal(seen.body.capabilityGrant.singleUseIntent, true);
  assert.equal(seen.body.capabilityGrant.ekodiApiToken, false);
  assert.equal(seen.body.dataPolicy.trainingAllowed, false);
  assert.equal(seen.body.dataPolicy.secondaryUseAllowed, false);
  assert.notEqual(seen.body.context.actorId, 'user-12345');
  assert.notEqual(seen.body.context.spaceId, 'jadam');
  assert.equal('email' in seen.body.input, false);
  assert.equal('apiKey' in seen.body.input, false);
  const ttl = new Date(seen.body.capabilityGrant.expiresAt) - new Date(seen.body.capabilityGrant.issuedAt);
  assert.equal(ttl, 60_000);
});

test('retrySafe modules reuse idempotency key and retry transient failures at most once', async () => {
  resetExternalAiModuleCircuitsForTest();
  const keys = [];
  let calls = 0;
  await withFetch(async (_url, init) => {
    calls += 1;
    const sent = JSON.parse(init.body);
    keys.push(init.headers['x-ekodi-idempotency-key']);
    if (calls === 1) return new Response('temporarily unavailable', { status: 503 });
    return new Response(JSON.stringify({
      contractVersion: '1.0.0',
      requestId: sent.requestId,
      ok: true,
      output: { campaign: 'retry-ok' },
    }), { status: 200 });
  }, async () => {
    const response = await handleExternalAiModuleGateway(request(), envFor({
      retrySafe: true,
      retryMaxAttempts: 2,
      retryBackoffMs: 0,
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.execution.attempts, 2);
  });
  assert.equal(calls, 2);
  assert.equal(keys[0], keys[1]);
});

test('non-transient provider failures are never retried', async () => {
  resetExternalAiModuleCircuitsForTest();
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return new Response('bad request', { status: 400 });
  }, async () => {
    const response = await handleExternalAiModuleGateway(request(), envFor({
      retrySafe: true,
      retryMaxAttempts: 2,
      retryBackoffMs: 0,
    }));
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.code, 'AI_MODULE_HTTP_400');
  });
  assert.equal(calls, 1);
});

test('oversized external AI responses are rejected', async () => {
  resetExternalAiModuleCircuitsForTest();
  await withFetch(async (_url, init) => {
    const sent = JSON.parse(init.body);
    return new Response(JSON.stringify({
      contractVersion: '1.0.0',
      requestId: sent.requestId,
      ok: true,
      output: { text: 'x'.repeat(3000) },
    }), { status: 200 });
  }, async () => {
    const response = await handleExternalAiModuleGateway(request(), envFor({ responseMaxBytes: 1024 }));
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.code, 'AI_MODULE_RESPONSE_TOO_LARGE');
  });
});

test('circuit breaker opens after repeated provider failures', async () => {
  resetExternalAiModuleCircuitsForTest();
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return new Response('unavailable', { status: 503 });
  }, async () => {
    const env = envFor({ circuitBreakerThreshold: 2, circuitBreakerCooldownMs: 60_000 });
    const first = await handleExternalAiModuleGateway(request(), env);
    const second = await handleExternalAiModuleGateway(request(), env);
    const third = await handleExternalAiModuleGateway(request(), env);
    assert.equal(first.status, 502);
    assert.equal(second.status, 502);
    assert.equal(third.status, 503);
    const result = await third.json();
    assert.equal(result.code, 'AI_MODULE_CIRCUIT_OPEN');
  });
  assert.equal(calls, 2);
});

test('gateway keeps direct browser execution closed', async () => {
  resetExternalAiModuleCircuitsForTest();
  const response = await handleExternalAiModuleGateway(
    new Request(API, { method: 'POST', body: JSON.stringify(body()) }),
    envFor(),
  );
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.code, 'AI_MODULE_UNAUTHORIZED');
});
