import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebExecutionRisk, executeWebTask, rankWebExecutionAdapters } from '../web-computer-execution-runtime.js';

test('owned free adapter ranks before external paid adapter', () => {
  const noop = async () => ({ ok: true, verified: true });
  const ranked = rankWebExecutionAdapters([
    { id: 'external', invoke: noop, trustClass: 'external', costClass: 'paid', routerScore: 99 },
    { id: 'ekodi', invoke: noop, trustClass: 'ekodi-owned', costClass: 'free', routerScore: 1 },
  ]);
  assert.deepEqual(ranked.map(x => x.id), ['ekodi', 'external']);
});

test('security bypass is forbidden and paid commitment is sovereign gated', () => {
  assert.equal(classifyWebExecutionRisk({ risks: ['captcha_bypass'] }).gate, 'blocked');
  assert.equal(classifyWebExecutionRisk({ risks: ['paid_commitment'] }).gate, 'human_sovereign_gate');
});

test('action success is not completion without independent verification', async () => {
  const result = await executeWebTask({}, { adapters: [{ id: 'owned', trustClass: 'ekodi-owned', costClass: 'free', invoke: async () => ({ ok: true }) }] });
  assert.equal(result.ok, false);
  assert.equal(result.evidence[0].failureClass, 'verification_failed');
});

test('verification failure fails over and returns verified evidence', async () => {
  const result = await executeWebTask({}, {
    adapters: [
      { id: 'owned', trustClass: 'ekodi-owned', costClass: 'free', invoke: async () => ({ ok: true, verified: false }) },
      { id: 'fallback', trustClass: 'external', costClass: 'low', invoke: async () => ({ ok: true, verified: true }) },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.adapter, 'fallback');
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence[1].verified, true);
});
