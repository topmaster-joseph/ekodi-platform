import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mallWorker, { ATTRIBUTION_WINDOW_DAYS, FEE_POLICY, feeForContext, publicProductUrl } from '../sites/ekodi-mall-api/worker.js';

test('personal seller fee policy is server-side 7/8/9 with PRO separate', () => {
  assert.equal(FEE_POLICY.individual.seller_direct, 7);
  assert.equal(FEE_POLICY.individual.marketplace, 8);
  assert.equal(FEE_POLICY.individual.ai_campaign, 9);
  assert.equal(FEE_POLICY.pgIncluded, true);
  assert.equal(FEE_POLICY.vatIncluded, true);
  assert.equal(FEE_POLICY.proAiSubscriptionSeparate, true);
  assert.equal(ATTRIBUTION_WINDOW_DAYS, 7);
});

test('verified business Store overrides attribution fee to 10 percent', () => {
  assert.equal(feeForContext({ sellerType: 'individual', sourceType: 'seller_direct' }), 7);
  assert.equal(feeForContext({ sellerType: 'individual', sourceType: 'marketplace' }), 8);
  assert.equal(feeForContext({ sellerType: 'individual', sourceType: 'ai_campaign' }), 9);
  assert.equal(feeForContext({ sellerType: 'business', storeType: 'business', storeVerificationStatus: 'verified', sourceType: 'seller_direct' }), 10);
  assert.equal(feeForContext({ sellerType: 'business', storeType: 'business', storeVerificationStatus: 'unverified', sourceType: 'seller_direct' }), 7);
});

test('public product link only becomes direct-attribution link when a server token exists', () => {
  assert.equal(publicProductUrl('abc12345'), 'https://mall.ekodi.kr/p/abc12345');
  assert.equal(publicProductUrl('abc12345', 'seller-token'), 'https://mall.ekodi.kr/p/abc12345?ref=seller-token');
});

test('health endpoint reports D1 readiness without requiring a seller session', async () => {
  const DB = { prepare(sql) { assert.match(sql, /SELECT 1/); return { first: async () => ({ ok: 1 }) }; } };
  const response = await mallWorker.fetch(new Request('https://api.mall.ekodi.kr/health'), { DB, ENVIRONMENT: 'test' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'ekodi-mall-api');
  assert.equal(body.database, true);
});

test('orders and settlement remain disabled in public policy', async () => {
  const response = await mallWorker.fetch(new Request('https://api.mall.ekodi.kr/api/policy'));
  const body = await response.json();
  assert.equal(body.paymentsEnabled, false);
  assert.equal(body.settlementEnabled, false);
  assert.deepEqual(body.fees.individual, { seller_direct: 7, marketplace: 8, ai_campaign: 9 });
});

test('migration creates isolated Mall tables including reserved order and settlement schemas', async () => {
  const sql = await readFile(new URL('../sites/ekodi-mall-api/migrations/0001_mall_core.sql', import.meta.url), 'utf8');
  for (const table of ['mall_seller_profiles','mall_memberships','mall_stores','mall_products','mall_share_links','mall_attribution_visits','mall_orders','mall_settlements']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS\s+(admins|finance_|customer_)/i);
});
