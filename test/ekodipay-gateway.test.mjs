// EKODIPAY-GATEWAY-001
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gatewayReadiness, gatewayClientKey, gatewayConfirm, gatewayGetPayment, settle } from '../ekodipay-gateway.js';

const env = { PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'test_ck_abc', TOSS_SECRET_KEY: 'test_sk_abc' };

test('only registered EKODI callers may use the gateway', async () => {
  assert.throws(() => gatewayReadiness(env, { callerId: 'stranger' }), /CALLER_NOT_ALLOWED/);
  const r = await settle(Promise.resolve().then(() => gatewayClientKey(env, { callerId: 'evil' })));
  assert.equal(r.ok, false);
});

test('readiness and client key never expose the secret key', () => {
  const r = gatewayReadiness(env, { callerId: 'books', profileId: 'ekodi' });
  assert.equal(r.ready, true); assert.equal(r.mode, 'test'); assert.equal(r.mid, 'q_ekodib62hb');
  assert.ok(!JSON.stringify(r).includes('test_sk_'));
  assert.equal(gatewayClientKey(env, { callerId: 'books' }), 'test_ck_abc');
});

test('confirm validates input and only calls the confirm path', async () => {
  const calls = [];
  const toss = async (_e, profile, path, opts) => { calls.push({ profile, path, opts }); return { status: 'DONE' }; };
  await assert.rejects(gatewayConfirm(env, { callerId: 'books', paymentKey: 'x', orderId: 'EKB-1', amount: 100 }, toss));
  await assert.rejects(gatewayConfirm(env, { callerId: 'books', paymentKey: 'pk_123456', orderId: 'EKB-20261027-ABCDEFGHJK', amount: -1 }, toss));
  await gatewayConfirm(env, { callerId: 'books', paymentKey: 'pk_123456', orderId: 'EKB-20261027-ABCDEFGHJK', amount: 9900 }, toss);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/payments/confirm');
  assert.equal(calls[0].opts.idempotencyKey, 'books-confirm-EKB-20261027-ABCDEFGHJK');
  await gatewayGetPayment(env, { callerId: 'books', paymentKey: 'pk_123456' }, toss);
  assert.equal(calls[1].path, '/v1/payments/pk_123456');
});

test('errors cross the RPC boundary as plain objects', async () => {
  const r = await settle(Promise.reject(Object.assign(new Error('거절'), { code: 'REJECT_CARD', status: 400 })));
  assert.deepEqual(r, { ok: false, error: { message: '거절', code: 'REJECT_CARD', status: 400 } });
});

test('books worker binds the gateway; keys never live in its config', () => {
  const toml = fs.readFileSync(new URL('../wrangler.books.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[\[services\]\]\nbinding = "EKODIPAY"\nservice = "ekodi-mall-api"\nentrypoint = "EkodiPayGateway"/);
  assert.doesNotMatch(toml, /_sk_|TOSS_SECRET_KEY\s*=/);
  const mall = fs.readFileSync(new URL('../sites/ekodi-mall/api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(mall, /^main = "main.js"$/m);
  const mallMain = fs.readFileSync(new URL('../sites/ekodi-mall/api/main.js', import.meta.url), 'utf8');
  assert.match(mallMain, /export class EkodiPayGateway extends WorkerEntrypoint/);
  assert.match(mallMain, /export \{ MallCatalog \}/);
  assert.match(fs.readFileSync(new URL('../wrangler.books.toml', import.meta.url), 'utf8'), /^EKODIPAY_PROFILE = "mall"$/m);
  const qtin = fs.readFileSync(new URL('../wrangler.qtin-order.toml', import.meta.url), 'utf8');
  assert.match(qtin, /^main = "qtin-order-entry.js"$/m);
  const entry = fs.readFileSync(new URL('../qtin-order-entry.js', import.meta.url), 'utf8');
  assert.match(entry, /export default worker;/);
  assert.match(entry, /export class EkodiPayGateway extends WorkerEntrypoint/);
});
