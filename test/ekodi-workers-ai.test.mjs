import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkersAi, WORKERS_AI_PROVIDER } from '../ekodi-workers-ai.js';

function ledgerEnv(run) {
  const rows = [];
  const DB = { prepare: () => ({ bind: (...args) => ({ run: async () => { rows.push(args); return { meta: { changes: 1 } }; } }) }) };
  return { env: { AI: { run }, DB }, rows };
}

test('success is returned unchanged and recorded in the shared routing ledger', async () => {
  const { env, rows } = ledgerEnv(async (model, input) => ({ response: `${model}:${input.prompt}` }));
  const out = await runWorkersAi(env, '@cf/x', { prompt: 'hi' }, { capability: 'documents', module: 'publishing-draft' });
  assert.deepEqual(out, { response: '@cf/x:hi' });
  await new Promise(r => setImmediate(r));
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], 'documents');
  assert.equal(rows[0][2], WORKERS_AI_PROVIDER);
  assert.equal(rows[0][3], 'selected');
  assert.match(rows[0][4], /^publishing-draft:@cf\/x$/);
});

test('failure is rethrown so feature fallbacks still run, and always recorded', async () => {
  const { env, rows } = ledgerEnv(async () => { throw new Error('boom'); });
  await assert.rejects(runWorkersAi(env, '@cf/y', {}, { module: 'live-stt', sampleRate: 0 }), /boom/);
  await new Promise(r => setImmediate(r));
  assert.equal(rows.length, 1);
  assert.equal(rows[0][3], 'attempt-failed');
});

test('success sampling and ledger-less workers', async () => {
  const sampled = ledgerEnv(async () => ({ ok: 1 }));
  await runWorkersAi(sampled.env, 'm', {}, { sampleRate: 0.1, random: () => 0.5 });
  await new Promise(r => setImmediate(r));
  assert.equal(sampled.rows.length, 0);
  const noLedger = await runWorkersAi({ AI: { run: async () => ({ ok: 2 }) } }, 'm', {});
  assert.deepEqual(noLedger, { ok: 2 });
  const brokenLedger = { AI: { run: async () => ({ ok: 3 }) }, DB: { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('no table'); } }) }) } };
  assert.deepEqual(await runWorkersAi(brokenLedger, 'm', {}), { ok: 3 });
  await assert.rejects(runWorkersAi({}, 'm', {}), /workers_ai_binding_unavailable/);
});
