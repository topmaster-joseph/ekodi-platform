import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutGateBlockers, livePaymentBlockers } from './verification.js';

const readyIndividual = { sale_type:'direct', status:'published', price:10000, direct_sale_status:'verified', seller_type:'individual', store_id:null, store_verification_status:null, checkout_ready:1 };

test('checkout gate eligibility stays independent from global payment activation', () => {
  assert.deepEqual(checkoutGateBlockers(readyIndividual), []);
  assert.deepEqual(livePaymentBlockers(readyIndividual, { PAYMENTS_ENABLED:'false' }), ['payments-disabled','toss-secret-missing']);
  assert.deepEqual(livePaymentBlockers(readyIndividual, { PAYMENTS_ENABLED:'true', TOSS_SECRET_KEY:'configured' }), []);
});

test('seller and business store verification are hard blockers', () => {
  assert.deepEqual(checkoutGateBlockers({ ...readyIndividual, direct_sale_status:'pending' }), ['seller-verification']);
  assert.deepEqual(checkoutGateBlockers({ ...readyIndividual, seller_type:'business', store_id:'sto_1', store_verification_status:'unverified' }), ['business-store-verification']);
});

test('direct published positive-price contract is required', () => {
  assert.deepEqual(checkoutGateBlockers({ ...readyIndividual, sale_type:'inquiry', status:'draft', price:null }), ['not-direct-sale','product-not-published','price-not-confirmed']);
});

test('manual checkout gate remains separate and auditable', () => {
  assert.deepEqual(livePaymentBlockers({ ...readyIndividual, checkout_ready:0 }, { PAYMENTS_ENABLED:'true', TOSS_SECRET_KEY:'configured' }), ['product-checkout-gate']);
});
