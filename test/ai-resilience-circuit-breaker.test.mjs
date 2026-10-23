import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_RESILIENCE_POLICY, resetAiResilienceCircuitsForTest, runAiEnhancedTask } from '../ai-resilience-runtime.js';

// 2026-10-23: the breaker used to forget a single failure on the next check, so it
// never reached failureThreshold and a failing provider was called on every task.
function harness() {
  let clock = 1_000_000;
  const calls = { flaky: 0, backup: 0 };
  const providers = ok => [
    { id: 'flaky', invoke: async () => { calls.flaky += 1; if (!ok.flaky) throw new Error('UPSTREAM_503'); return 'flaky-ok'; } },
    { id: 'backup', invoke: async () => { calls.backup += 1; return 'backup-ok'; } },
  ];
  const run = (ok = { flaky: false }) => runAiEnhancedTask({ providers: providers(ok), fallback: () => 'core', now: () => clock });
  return { calls, run, advance: ms => { clock += ms; } };
}

test('repeated provider failures open the circuit and route straight to the next provider', async () => {
  resetAiResilienceCircuitsForTest();
  const h = harness();
  for (let i = 0; i < AI_RESILIENCE_POLICY.failureThreshold; i += 1) {
    assert.equal((await h.run()).provider, 'backup');
    h.advance(1_000);
  }
  assert.equal(h.calls.flaky, AI_RESILIENCE_POLICY.failureThreshold);
  const skipped = await h.run();
  assert.equal(skipped.provider, 'backup');
  assert.equal(h.calls.flaky, AI_RESILIENCE_POLICY.failureThreshold, 'open circuit must not call the failing provider');
});

test('expired circuit allows one half-open probe and closes on success', async () => {
  resetAiResilienceCircuitsForTest();
  const h = harness();
  for (let i = 0; i < AI_RESILIENCE_POLICY.failureThreshold; i += 1) await h.run();
  h.advance(AI_RESILIENCE_POLICY.cooldownMs + 1);
  const probe = await h.run({ flaky: true });
  assert.equal(probe.provider, 'flaky');
  const after = await h.run({ flaky: true });
  assert.equal(after.provider, 'flaky');
});

test('a failed half-open probe reopens the circuit immediately', async () => {
  resetAiResilienceCircuitsForTest();
  const h = harness();
  for (let i = 0; i < AI_RESILIENCE_POLICY.failureThreshold; i += 1) await h.run();
  h.advance(AI_RESILIENCE_POLICY.cooldownMs + 1);
  await h.run();
  const before = h.calls.flaky;
  await h.run();
  assert.equal(h.calls.flaky, before, 'reopened circuit must skip the provider');
});

test('isolated failures further apart than the cooldown do not open the circuit', async () => {
  resetAiResilienceCircuitsForTest();
  const h = harness();
  await h.run();
  h.advance(AI_RESILIENCE_POLICY.cooldownMs + 1);
  await h.run();
  h.advance(1_000);
  await h.run();
  assert.equal(h.calls.flaky, 3);
});
