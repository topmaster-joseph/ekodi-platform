import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommerceAction, commandPlaneCapabilityContract, commerceAutonomyPolicy, routeCommerceModel } from './commerce-os.js';

test('commerce model router keeps affiliate and inquiry outside EKODI payment', () => {
  const affiliate = routeCommerceModel({ saleType:'affiliate' });
  assert.equal(affiliate.transactionOwner, 'external-merchant');
  assert.equal(affiliate.requiresEkodiPayment, false);
  const inquiry = routeCommerceModel({ saleType:'inquiry' });
  assert.equal(inquiry.route, 'inquiry');
  assert.equal(inquiry.requiresEkodiPayment, false);
});

test('direct commerce route delegates provider choice to capability registry', () => {
  const route = routeCommerceModel({ saleType:'direct', env:{ PAYMENT_PROVIDER:'toss', TOSS_SECRET_KEY:'secret', PAYMENTS_ENABLED:'false' } });
  assert.equal(route.model, 'direct');
  assert.equal(route.paymentProvider, 'toss');
  assert.equal(route.paymentReady, false);
  assert.equal(route.requiresEkodiPayment, true);
});

test('high-impact commerce execution stays human-gated', () => {
  for (const action of ['payment.capture','payment.refund','payout.execute','buyer_pii.release','supplier.contract.accept']) {
    assert.equal(classifyCommerceAction(action), 'red');
  }
  const policy = commerceAutonomyPolicy();
  assert.equal(policy.red.humanGate, true);
  assert.equal(policy.green.humanGate, false);
});
test('Mall exposes a symbolic capability contract to the v8 Command Plane', () => {
  const contract = commandPlaneCapabilityContract();
  assert.equal(contract.service, 'ekodi-mall');
  assert.equal(contract.namespace, 'commerce');
  assert.equal(contract.addressMode, 'symbolic');
  assert.ok(contract.operations.includes('request-human-decision'));
  assert.ok(contract.highImpactActions.includes('payment.capture'));
  assert.equal(JSON.stringify(contract).includes('TOSS_SECRET_KEY'), false);
});
