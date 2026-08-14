import test from 'node:test';
import assert from 'node:assert/strict';
import { makePublicUrl, normalizeProductInput, resolveFeeRate } from './worker.js';

test('individual fee policy stays 7/8/9 and business verified store is 10', () => {
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'direct' }), 7);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'marketplace' }), 8);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'ai' }), 9);
  assert.equal(resolveFeeRate({ sellerType: 'business', attributionType: 'direct', businessStoreVerified: true }), 10);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'unknown' }), null);
});

test('public product URL is stable and opaque', () => {
  assert.equal(makePublicUrl('https://mall.ekodi.kr/', 'ABC123'), 'https://mall.ekodi.kr/p/ABC123');
});

test('product input keeps Store optional and validates affiliate link', () => {
  const personal = normalizeProductInput({ seller: { type: 'individual', displayName: '홍길동' }, store: null, product: { name: '테스트 상품', saleType: 'direct', category: 'local', contact: 'seller@example.com' } });
  assert.deepEqual(personal.errors, []);
  assert.equal(personal.value.store, null);
  const affiliate = normalizeProductInput({ seller: { type: 'individual', displayName: '홍길동' }, product: { name: '제휴 상품', saleType: 'affiliate', contact: 'seller@example.com', action: { url: 'http://unsafe.example.com' } } });
  assert.ok(affiliate.errors.some((value) => value.includes('HTTPS')));
});
