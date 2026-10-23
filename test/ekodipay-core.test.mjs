// EKODIPAY-CORE-001 — shared payment module: merchant profiles, readiness, MID switching, Toss client.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pay from '../ekodipay-core.js';

const base = { PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'test_ck_a', TOSS_SECRET_KEY: 'test_sk_a' };
const churchEnv = {
  ...base,
  EKODIPAY_MERCHANTS: JSON.stringify({ church: { label: '에코디교회', mid: 'q_church01', owner: '에코디교회' } }),
  TOSS_CLIENT_KEY__CHURCH: 'live_ck_c',
  TOSS_SECRET_KEY__CHURCH: 'live_sk_c',
};

test('default profile is the EKODI MID and accepts the legacy key names', () => {
  const r = pay.readiness(base);
  assert.equal(r.ready, true);
  assert.equal(r.profile, 'ekodi');
  assert.equal(r.mid, 'q_ekodib62hb');
  assert.equal(r.mode, 'test');
  assert.equal(r.testReady, true);
  assert.equal(r.publicReady, false, 'test keys never open public checkout');
});

test('readiness fails closed: disabled, missing keys, unknown profile, mixed test/live keys, staging', () => {
  assert.deepEqual(pay.readiness({ ...base, PAYMENTS_ENABLED: 'false' }).missing, ['payments-disabled']);
  assert.deepEqual(pay.readiness({ PAYMENTS_ENABLED: 'true' }).missing, ['toss-client-key', 'toss-secret-key']);
  assert.ok(pay.readiness({ ...base, EKODIPAY_PROFILE: 'nobody' }).missing.includes('unknown-merchant-profile'));
  assert.ok(pay.readiness({ ...base, EKODIPAY_PROFILE: 'BAD PROFILE!' }).missing.includes('unknown-merchant-profile'));
  assert.ok(pay.readiness({ ...base, TOSS_SECRET_KEY: 'live_sk_a' }).missing.includes('key-mode-mismatch'));
  assert.ok(pay.readiness(base, { staging: true }).missing.includes('isolated-staging'));
});

test('a new MID is added by configuration only and selected with EKODIPAY_PROFILE', () => {
  const env = { ...churchEnv, EKODIPAY_PROFILE: 'church' };
  const r = pay.readiness(env);
  assert.equal(r.ready, true);
  assert.equal(r.profile, 'church');
  assert.equal(r.mid, 'q_church01');
  assert.equal(r.publicReady, true);
  // Suffixed keys are per-profile; the legacy names never leak into another profile.
  assert.deepEqual(pay.merchantKeys({ ...base, EKODIPAY_MERCHANTS: churchEnv.EKODIPAY_MERCHANTS }, 'church'), { clientKey: '', secretKey: '' });
  // Built-in profiles cannot be overridden by configuration.
  const hijack = { ...base, EKODIPAY_MERCHANTS: JSON.stringify({ ekodi: { mid: 'q_evil' } }) };
  assert.equal(pay.readiness(hijack).mid, 'q_ekodib62hb');
  // Malformed configuration is ignored.
  assert.equal(pay.readiness({ ...base, EKODIPAY_MERCHANTS: '{not json', EKODIPAY_PROFILE: 'church' }).ready, false);
});

test('order ids carry the merchant profile so old orders keep their original MID after a switch', () => {
  assert.equal(pay.tagOrderId('QTIN-202612-abc', 'ekodi'), 'QTIN-202612-abc', 'default profile is untagged (existing orders compatible)');
  const tagged = pay.tagOrderId('QTIN-202612-abc', 'church');
  assert.equal(tagged, 'QTIN-mchurch-202612-abc');
  assert.match(tagged, /^[A-Za-z0-9_-]{6,64}$/);
  assert.equal(pay.profileFromOrderId(tagged), 'church');
  assert.equal(pay.profileFromOrderId('QTIN-202612-abc'), 'ekodi');
  assert.equal(pay.profileFromOrderId('QTINTEST-mchurch-202612-x'), 'church');
  assert.equal(pay.profileFromOrderId('QTIN-202612-mx-abc'), 'ekodi', 'campaign digits never parse as a tag');
});

test('Toss client uses the profile secret, sends idempotency keys and maps errors', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith('/fail')) return new Response(JSON.stringify({ code: 'REJECT', message: '거절' }), { status: 400 });
    return new Response(JSON.stringify({ status: 'DONE' }), { status: 200 });
  };
  try {
    const env = { ...churchEnv };
    await pay.confirmPayment(env, 'church', { paymentKey: 'pk', orderId: 'QTIN-mchurch-1-a', amount: 1000.9 }, 'idem-1');
    assert.equal(calls[0].init.headers.authorization, `Basic ${btoa('live_sk_c:')}`);
    assert.equal(calls[0].init.headers['idempotency-key'], 'idem-1');
    assert.equal(JSON.parse(calls[0].init.body).amount, 1000);
    await pay.getPayment(env, 'ekodi', 'pk2');
    assert.equal(calls[1].init.headers.authorization, `Basic ${btoa('test_sk_a:')}`);
    await assert.rejects(pay.tossRequest(env, 'church', '/fail'), e => e.code === 'REJECT' && e.status === 400);
    await assert.rejects(pay.tossRequest({}, 'church', '/x'), e => e.code === 'MERCHANT_KEY_MISSING');
  } finally {
    globalThis.fetch = original;
  }
  globalThis.fetch = async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
  try {
    await assert.rejects(pay.getPayment(base, 'ekodi', 'pk'), e => e.code === 'TOSS_TIMEOUT');
  } finally {
    globalThis.fetch = original;
  }
});

test('merchant assignment: QTIN on q_ekodib62hb, EKODI Mall on ekobizav68, keys never cross', () => {
  assert.equal(pay.merchantProfile('ekodi').mid, 'q_ekodib62hb');
  assert.equal(pay.merchantProfile('mall').mid, 'ekobizav68');
  const env = {
    PAYMENTS_ENABLED: 'true', DB: { binding: true },
    TOSS_CLIENT_KEY: 'test_ck_qtin', TOSS_SECRET_KEY: 'test_sk_qtin',
    TOSS_CLIENT_KEY__MALL: 'test_ck_mall', TOSS_SECRET_KEY__MALL: 'test_sk_mall',
  };
  const mall = pay.withMerchantKeys(env, 'mall');
  assert.equal(mall.TOSS_CLIENT_KEY, 'test_ck_mall');
  assert.equal(mall.TOSS_SECRET_KEY, 'test_sk_mall');
  assert.equal(mall.EKODIPAY_MID, 'ekobizav68');
  assert.equal(mall.DB, env.DB, 'bindings are preserved');
  assert.equal(env.TOSS_SECRET_KEY, 'test_sk_qtin', 'original env is not mutated');
  // A mall Worker that only has the legacy names must NOT pick them up (fail closed).
  const legacyOnly = pay.withMerchantKeys({ PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_x', TOSS_SECRET_KEY: 'live_sk_x' }, 'mall');
  assert.equal(legacyOnly.TOSS_CLIENT_KEY, '');
  assert.equal(legacyOnly.TOSS_SECRET_KEY, '');
  assert.equal(pay.readiness(env, { profileId: 'mall' }).mid, 'ekobizav68');
  assert.equal(pay.readiness({ ...env, TOSS_CLIENT_KEY__MALL: '' }, { profileId: 'mall' }).ready, false);
  assert.equal(pay.merchantProfile('q_ekodim56wc'), null, 'held MID is not registered');
});
