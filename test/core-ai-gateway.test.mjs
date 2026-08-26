import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoreAiGateway, getCoreAiGatewayStatus } from '../core-ai-gateway.js';
import { resetAiResilienceCircuitsForTest } from '../ai-resilience-runtime.js';

test('Core AI Gateway degrades to non-AI fallback when providers are disabled', async () => {
  const gateway = buildCoreAiGateway({ AI_PROVIDER: 'NONE' }, [{
    id: 'example-ai',
    invoke: async () => { throw new Error('must not run'); },
  }]);
  const result = await gateway.run({
    taskName: 'marketing-summary',
    context: { text: 'source' },
    fallback: ({ context }) => ({ summary: context.text }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'free_assist');
  assert.equal(result.degraded, true);
  assert.equal(result.provider, null);
  assert.deepEqual(result.value, { summary: 'source' });
});

test('Core AI Gateway can fail over to another replaceable provider', async () => {
  resetAiResilienceCircuitsForTest();
  const calls = [];
  const gateway = buildCoreAiGateway({}, [
    { id: 'provider-a', invoke: async () => { calls.push('a'); throw new Error('down'); } },
    { id: 'provider-b', invoke: async ({ taskName }) => { calls.push('b'); return `${taskName}:ok`; } },
  ]);
  const result = await gateway.run({
    taskName: 'assist',
    fallback: () => 'fallback',
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'ai');
  assert.equal(result.provider, 'provider-b');
  assert.equal(result.value, 'assist:ok');
  assert.deepEqual(calls, ['a', 'b']);
});

test('Core AI status is explicitly provider-independent', () => {
  const status = getCoreAiGatewayStatus({ AI_PROVIDER: 'NONE' });
  assert.equal(status.gateway, 'ekodi-core-ai');
  assert.equal(status.providerIndependent, true);
  assert.equal(status.aiOptional, true);
  assert.equal(status.providerDisabled, true);
  assert.equal(status.mode, 'free_assist');
});

test('Core AI Gateway rejects incomplete execution contracts before provider invocation', async () => {
  let invoked = false;
  const gateway = buildCoreAiGateway({}, [{
    id: 'provider-a',
    invoke: async () => { invoked = true; return 'unexpected'; },
  }]);

  await assert.rejects(
    gateway.run({ fallback: () => 'fallback' }),
    /requires taskName/,
  );
  await assert.rejects(
    gateway.run({ taskName: 'assist' }),
    /requires a non-AI fallback/,
  );
  assert.equal(invoked, false);
});
