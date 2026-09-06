import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeVerificationOperations, checkoutGateBlockers, livePaymentBlockers } from './verification.js';

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


test('verification operations accept allowlisted Google sessions and preserve service-token automation', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const service = await authorizeVerificationOperations(new Request('https://mall-api.ekodi.kr/api/internal/verification/queue', { headers: { 'x-ekodi-mall-ops-token':'secret' } }), { MALL_OPERATIONS_TOKEN:'secret' });
    assert.equal(service.ok, true);
    assert.equal(service.actor, 'mall-ops:service-token');

    globalThis.fetch = async () => new Response(JSON.stringify({ id:'u_ops', email:'ops@example.com' }), { status:200, headers:{ 'content-type':'application/json' } });
    const request = new Request('https://mall-api.ekodi.kr/api/internal/verification/queue', { headers:{ authorization:'Bearer user-token' } });
    const allowed = await authorizeVerificationOperations(request, { SUPABASE_URL:'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY:'public', MALL_OPERATIONS_EMAILS:'ops@example.com,other@example.com' });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.actor, 'mall-ops:ops@example.com');

    const denied = await authorizeVerificationOperations(request, { SUPABASE_URL:'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY:'public', MALL_OPERATIONS_EMAILS:'other@example.com' });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 403);

    const unauthenticated = await authorizeVerificationOperations(new Request('https://mall-api.ekodi.kr/api/internal/verification/queue'), { MALL_OPERATIONS_EMAILS:'ops@example.com' });
    assert.equal(unauthenticated.ok, false);
    assert.equal(unauthenticated.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
