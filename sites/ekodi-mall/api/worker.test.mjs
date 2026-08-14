import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makePublicUrl, makeSellerShareUrl, normalizeProductInput, resolveFeeRate, resolveTrustedAttribution } from './worker.js';

test('individual fee policy stays 7/8/9 and verified business Store is 10', () => {
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'direct' }), 7);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'marketplace' }), 8);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'ai' }), 9);
  assert.equal(resolveFeeRate({ sellerType: 'business', attributionType: 'direct', businessStoreVerified: true }), 10);
  assert.equal(resolveFeeRate({ sellerType: 'business', attributionType: 'direct', businessStoreVerified: false }), 7);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'unknown' }), null);
});

test('untrusted source values fall back to Mall marketplace rather than direct', () => {
  assert.equal(resolveTrustedAttribution('direct'), 'direct');
  assert.equal(resolveTrustedAttribution('ai'), 'ai');
  assert.equal(resolveTrustedAttribution('marketplace'), 'marketplace');
  assert.equal(resolveTrustedAttribution('direct-from-query'), 'marketplace');
  assert.equal(resolveTrustedAttribution(''), 'marketplace');
});

test('canonical product URL and seller-issued direct link are separate', () => {
  const canonical = makePublicUrl('https://mall.ekodi.kr/', 'ABC123');
  assert.equal(canonical, 'https://mall.ekodi.kr/p/ABC123');
  assert.equal(makeSellerShareUrl(canonical, 'shr_secret', 'sms'), 'https://mall.ekodi.kr/p/ABC123?ref=shr_secret&ch=sms');
  assert.equal(new URL(canonical).searchParams.has('ref'), false);
});

test('product input keeps Store optional and validates affiliate link', () => {
  const personal = normalizeProductInput({ seller: { type: 'individual', displayName: '홍길동' }, store: null, product: { name: '테스트 상품', saleType: 'direct', category: 'local', contact: 'seller@example.com' } });
  assert.deepEqual(personal.errors, []);
  assert.equal(personal.value.store, null);
  const affiliate = normalizeProductInput({ seller: { type: 'individual', displayName: '홍길동' }, product: { name: '제휴 상품', saleType: 'affiliate', contact: 'seller@example.com', action: { url: 'http://unsafe.example.com' } } });
  assert.ok(affiliate.errors.some((value) => value.includes('HTTPS')));
});

test('secure attribution migration separates share links from visitor first touch', async () => {
  const sql = await readFile(new URL('./migrations/0002_secure_attribution.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS share_links/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS attribution_visits/);
  assert.match(sql, /UNIQUE\(product_id, visitor_id\)/);
  assert.match(sql, /fee_percent INTEGER NOT NULL CHECK \(fee_percent IN \(7,8,9,10\)\)/);
});

test('legacy public direct-token minting endpoint is retired', async () => {
  const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
  assert.match(source, /DIRECT_ATTRIBUTION_ENDPOINT_RETIRED/);
  assert.match(source, /\/api\/public\/attribution\/visit/);
  assert.match(source, /\/share-links/);
  assert.doesNotMatch(source, /function createDirectAttribution/);
});
