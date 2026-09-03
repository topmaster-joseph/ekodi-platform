import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import paymentWorker from '../payment-worker.js';
import { PAYMENT_STATUSES, validatePaymentIntentInput } from '../payment-core.js';

const validIntent = {
  workspace_id: 'ws_demo_01',
  source_type: 'mall.order',
  source_id: 'order_123',
  order_no: 'ORD-123',
  title: '테스트 주문',
  amount: 12000,
  currency: 'KRW',
};

test('normalizes a safe workspace-scoped KRW payment intent', () => {
  assert.deepEqual(validatePaymentIntentInput(validIntent), validIntent);
  assert.ok(PAYMENT_STATUSES.includes('PARTIAL_REFUNDED'));
});

test('rejects floating amounts and raw card data', () => {
  assert.throws(() => validatePaymentIntentInput({ ...validIntent, amount: 12.5 }), /amount_must_be_positive_integer/);
  assert.throws(() => validatePaymentIntentInput({ ...validIntent, card: { cardNumber: '4111111111111111' } }), /raw_payment_data_forbidden/);
});

test('church donation is disabled until provider approval is explicit', () => {
  assert.throws(() => validatePaymentIntentInput({ ...validIntent, source_type: 'church.donation' }), /donation_payment_not_approved/);
  assert.equal(validatePaymentIntentInput({ ...validIntent, source_type: 'church.donation' }, { donationApproved: true }).source_type, 'church.donation');
});

test('shadow runtime advertises health but never executes a payment', async () => {
  const env = { EKODI_PAYMENT_ROLLOUT: 'shadow', EKODI_PAYMENT_VERSION: '1.0.0', ALLOW_DONATION_PAYMENTS: 'false' };
  const health = await paymentWorker.fetch(new Request('https://pay.ekodi.kr/health'), env);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.boundary, 'registered-common-service');
  assert.equal(body.transactionExecution, false);
  assert.equal(body.platformFundPooling, false);

  const attempt = await paymentWorker.fetch(new Request('https://pay.ekodi.kr/api/payment-intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validIntent),
  }), env);
  assert.equal(attempt.status, 503);
  assert.equal((await attempt.json()).error, 'payment_execution_not_activated');
});

test('payment production manifest is strict JSON and first-deploy guarded', () => {
  const raw = fs.readFileSync(new URL('../deploy/manifests/payment.worker.json', import.meta.url), 'utf8');
  assert.notEqual(raw.charCodeAt(0), 0xFEFF);
  const manifest = JSON.parse(raw);
  assert.equal(manifest.worker.name, 'ekodi-payment');
  assert.equal(manifest.worker.allowFirstDeploy, true);
});
