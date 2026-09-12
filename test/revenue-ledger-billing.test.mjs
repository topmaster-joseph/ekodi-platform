import test from 'node:test';
import assert from 'node:assert/strict';
import { billingChargeRevenueInput } from '../revenue-ledger-billing.js';

test('Toss completed subscription charge maps to confirmed realized revenue', () => {
  assert.deepEqual(billingChargeRevenueInput({
    id: 41,
    subscription_id: 7,
    cycle_key: 'renew:7:2026-09-12',
    order_id: 'ekodi-renew-7-abc',
    amount: 39900,
    provider_payment_key: 'pay_toss_123',
    completed_at: '2026-09-12T10:00:00.000Z',
    subject_type: 'tenant',
    subject_key: 'jadam',
    site: 'marketing',
    plan_id: 'pro',
  }), {
    provider: 'toss',
    externalRef: 'pay_toss_123',
    source: 'subscription',
    amount: 39900,
    currency: 'KRW',
    confirmed: true,
    tenantKey: 'jadam',
    siteKey: 'marketing',
    subjectType: 'tenant',
    subjectKey: 'jadam',
    occurredAt: '2026-09-12T10:00:00.000Z',
    metadata: {
      billingChargeId: 41,
      subscriptionId: 7,
      cycleKey: 'renew:7:2026-09-12',
      orderId: 'ekodi-renew-7-abc',
      planId: 'pro',
      providerFeeAccounting: 'separate_expense',
    },
  });
});

test('store revenue stays scoped to the store and does not masquerade as tenant revenue', () => {
  const input = billingChargeRevenueInput({
    id: 42,
    subscription_id: 8,
    order_id: 'order-store-42',
    amount: 9900,
    subject_type: 'store',
    subject_key: '7b3d0ab0-0000-4000-8000-000000000042',
    site: 'marketing',
    plan_id: 'plus',
    created_at: '2026-09-12T10:10:00.000Z',
  });
  assert.equal(input.externalRef, 'order-store-42');
  assert.equal(input.subjectType, 'store');
  assert.equal(input.tenantKey, '');
  assert.equal(input.confirmed, true);
});

test('billing charge requires a stable external reference', () => {
  assert.throws(() => billingChargeRevenueInput({ amount: 1000 }), /reference/);
});
