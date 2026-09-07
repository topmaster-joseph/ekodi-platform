import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { authorizeVerificationOperations, checkoutGateBlockers, livePaymentBlockers, launchReadinessBlockers, handleVerificationRequest } from './verification.js';

class D1Statement { constructor(db,sql){this.db=db;this.sql=sql;this.args=[];} bind(...args){this.args=args;return this;} run(){return this.db.prepare(this.sql).run(...this.args);} first(){return this.db.prepare(this.sql).get(...this.args)||null;} all(){return {results:this.db.prepare(this.sql).all(...this.args)};} }
class D1TestDatabase { constructor(){this.db=new DatabaseSync(':memory:');} prepare(sql){return new D1Statement(this.db,sql);} async batch(statements){return statements.map((s)=>s.run());} exec(sql){this.db.exec(sql);} close(){this.db.close();} }
function migratedDb(){const db=new D1TestDatabase();const dir=new URL('./migrations/',import.meta.url);for(const name of readdirSync(dir).filter((v)=>v.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));return db;}

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


test('production launch gate stays fail-closed until commerce evidence is complete', () => {
  const counts={checkoutGateEligibleCount:1,checkoutGateEnabledCount:1};
  assert.deepEqual(launchReadinessBlockers({counts,env:{MALL_OPERATIONS_EMAILS:'ops@example.com'}}), ['toss-secret-missing','legal-readiness-missing','privacy-readiness-missing','refund-readiness-missing','payout-readiness-missing']);
  const env={TOSS_SECRET_KEY:'configured',MALL_OPERATIONS_EMAILS:'ops@example.com',MALL_LEGAL_READINESS_REF:'legal:v1',MALL_PRIVACY_READINESS_REF:'privacy:v1',MALL_REFUND_READINESS_REF:'refund:v1',MALL_PAYOUT_READINESS_REF:'payout:v1'};
  assert.deepEqual(launchReadinessBlockers({counts,env}), []);
  assert.deepEqual(launchReadinessBlockers({counts:{...counts,checkoutGateEnabledCount:0},env}), ['no-checkout-gate-product']);
});

test('operator launch readiness endpoint executes against the full Mall D1 schema', async () => {
  const db=migratedDb();
  try { const request=new Request('https://mall-api.ekodi.kr/api/internal/verification/launch-readiness',{headers:{'x-ekodi-mall-ops-token':'secret'}}); const result=await handleVerificationRequest(request,{DB:db,MALL_OPERATIONS_TOKEN:'secret',PAYMENTS_ENABLED:'false'}); assert.equal(result.status,200); assert.equal(result.body.launch.status,'blocked'); assert.equal(result.body.launch.counts.productCount,0); assert.ok(result.body.launch.activationBlockers.includes('no-checkout-eligible-product')); assert.ok(result.body.launch.liveBlockers.includes('payments-disabled')); } finally { db.close(); }
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
