import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MallCatalog, feeForFirstTouch, trustedSource } from './entry.js';

test('first-touch fee contract keeps personal 7/8/9 and verified business Store 10', () => {
  assert.equal(feeForFirstTouch({ sellerType: 'individual', sourceType: 'direct' }), 7);
  assert.equal(feeForFirstTouch({ sellerType: 'individual', sourceType: 'marketplace' }), 8);
  assert.equal(feeForFirstTouch({ sellerType: 'individual', sourceType: 'ai' }), 9);
  assert.equal(feeForFirstTouch({ sellerType: 'business', businessStoreVerified: true, sourceType: 'direct' }), 10);
  assert.equal(feeForFirstTouch({ sellerType: 'business', businessStoreVerified: false, sourceType: 'direct' }), 7);
});

test('only server-resolved direct/AI sources are trusted', () => {
  assert.equal(trustedSource('direct'), 'direct');
  assert.equal(trustedSource('ai'), 'ai');
  assert.equal(trustedSource('marketplace'), 'marketplace');
  assert.equal(trustedSource('direct-from-query'), 'marketplace');
  assert.equal(trustedSource(''), 'marketplace');
});

test('first-touch migration is additive after order/settlement migration', async () => {
  const sql = await readFile(new URL('./migrations/0003_first_touch_attribution.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS attribution_visits/);
  assert.match(sql, /UNIQUE\(product_id, visitor_id\)/);
  assert.match(sql, /attribution_token TEXT NOT NULL REFERENCES attribution_tokens/);
  assert.match(sql, /fee_rate_percent INTEGER NOT NULL CHECK \(fee_rate_percent IN \(7,8,9,10\)\)/);
});

test('verification migration keeps requests and operator audit inside Mall D1', async () => {
  const sql = await readFile(new URL('./migrations/0005_verification_readiness.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS verification_requests/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mall_ops_audit/);
  assert.match(sql, /WHERE status IN \('submitted','under_review'\)/);
  assert.match(sql, /REFERENCES seller_profiles\(user_id\)/);
});

test('entry layer delegates verification, orders, Toss and settlement API without merging runtimes', async () => {
  const source = await readFile(new URL('./entry.js', import.meta.url), 'utf8');
  assert.match(source, /import core from '\.\/worker\.js'/);
  assert.match(source, /handleVerificationRequest/);
  assert.match(source, /verificationSchemaReady/);
  assert.match(source, /return core\.fetch\(request, env\)/);
  assert.match(source, /\/api\/public\/attribution\/visit/);
  assert.match(source, /\/api\/public\/products/);
  assert.match(source, /version:\s*4/);
});

test('legacy MallCatalog Durable Object export remains non-destructive during D1 cutover', async () => {
  assert.equal(typeof MallCatalog, 'function');
  const catalog = new MallCatalog({}, {});
  const response = await catalog.fetch(new Request('https://legacy.invalid/'));
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.error, 'LEGACY_MALL_CATALOG_RETIRED');

  const config = await readFile(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /\[exports\.MallCatalog\]/);
  assert.match(config, /type\s*=\s*"durable-object"/);
  assert.match(config, /storage\s*=\s*"sqlite"/);
  assert.doesNotMatch(config, /deleted_classes\s*=.*MallCatalog/);
});
