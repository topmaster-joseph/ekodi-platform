import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePaymentProvider,
  paymentActivationBlockers,
  paymentExecutionBlockers,
  paymentProviderReadiness,
  selectedPaymentProvider,
} from './payment-capabilities.js';

test('payment provider registry is explicit and backwards compatible with Toss secret', () => {
  assert.equal(normalizePaymentProvider('bank-transfer'), 'manual_bank');
  assert.equal(normalizePaymentProvider('unknown-provider'), 'none');
  assert.equal(selectedPaymentProvider({ PAYMENT_PROVIDER:'toss' }), 'toss');
  assert.equal(selectedPaymentProvider({ TOSS_SECRET_KEY:'legacy-secret' }), 'toss');
  assert.equal(selectedPaymentProvider({}), 'none');
});

test('unknown and unimplemented providers fail closed', () => {
  assert.deepEqual(paymentActivationBlockers({ PAYMENT_PROVIDER:'unknown' }), ['payment-provider-invalid','payment-provider-missing']);
  const portone = paymentProviderReadiness({ PAYMENT_PROVIDER:'portone', PORTONE_API_SECRET:'a', PORTONE_STORE_ID:'s', PORTONE_CHANNEL_KEY:'c' });
  assert.equal(portone.configured, true);
  assert.equal(portone.adapterImplemented, false);
  assert.equal(portone.liveReady, false);
  assert.ok(portone.blockers.includes('provider-adapter-not-implemented'));
});
test('Toss is the only implemented live adapter in this release', () => {
  const disabled = paymentProviderReadiness({ PAYMENT_PROVIDER:'toss' });
  assert.equal(disabled.adapterImplemented, true);
  assert.equal(disabled.configured, false);
  assert.deepEqual(disabled.blockers, ['toss-secret-missing']);

  const ready = paymentProviderReadiness({ PAYMENT_PROVIDER:'toss', TOSS_SECRET_KEY:'secret', PAYMENTS_ENABLED:'true' });
  assert.equal(ready.activationReady, true);
  assert.equal(ready.liveReady, true);
  assert.deepEqual(paymentExecutionBlockers({ PAYMENT_PROVIDER:'toss', TOSS_SECRET_KEY:'secret', PAYMENTS_ENABLED:'false' }), ['payments-disabled']);
});

test('manual bank is represented but cannot silently become executable', () => {
  const readiness = paymentProviderReadiness({
    PAYMENT_PROVIDER:'manual_bank',
    MALL_BANK_ACCOUNT_REF:'vault:bank-account',
    MALL_MANUAL_PAYMENT_POLICY_REF:'policy:manual-bank-v1',
    PAYMENTS_ENABLED:'true',
  });
  assert.equal(readiness.requiresHumanConfirmation, true);
  assert.equal(readiness.configured, true);
  assert.equal(readiness.adapterImplemented, false);
  assert.equal(readiness.liveReady, false);
  assert.ok(readiness.blockers.includes('provider-adapter-not-implemented'));
});
