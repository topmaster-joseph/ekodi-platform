import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderAmounts, makeAttributedUrl, makePublicUrl, normalizeProductInput, resolveFeeRate } from './worker.js';

test('individual fee policy stays 7/8/9 and business verified store is 10', () => {
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'direct' }), 7);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'marketplace' }), 8);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'ai' }), 9);
  assert.equal(resolveFeeRate({ sellerType: 'business', attributionType: 'direct', businessStoreVerified: true }), 10);
  assert.equal(resolveFeeRate({ sellerType: 'individual', attributionType: 'unknown' }), null);
});

test('order fee calculation uses whole-KRW floor and never exceeds gross', () => {
  assert.deepEqual(calculateOrderAmounts(100000, 7), {
    grossAmount: 100000,
    feeRatePercent: 7,
    platformFeeAmount: 7000,
    sellerSettlementAmount: 93000
  });
  assert.deepEqual(calculateOrderAmounts(9999, 9), {
    grossAmount: 9999,
    feeRatePercent: 9,
    platformFeeAmount: 899,
    sellerSettlementAmount: 9100
  });
});

test('canonical product URL stays marketplace while attributed URLs carry opaque ref codes', () => {
  assert.equal(makePublicUrl('https://ekodi.kr/ekodibiz/mall/', 'ABC123'), 'https://ekodi.kr/ekodibiz/mall/p/ABC123');
  assert.equal(makeAttributedUrl('https://ekodi.kr/ekodibiz/mall/', 'ABC123', 'sl_OPAQUE'), 'https://ekodi.kr/ekodibiz/mall/p/ABC123?ref=sl_OPAQUE');
});

test('product input keeps Store optional and validates affiliate link', () => {
  const personal = normalizeProductInput({ seller: { type: 'individual', displayName: '홍길동' }, store: null, product: { name: '테스트 상품', saleType: 'direct', category: 'local', contact: 'seller@example.com' } });
  assert.deepEqual(personal.errors, []);
  assert.equal(personal.value.store, null);
  const affiliate = normalizeProductInput({ seller: { type: 'individual', displayName: '홍길동' }, product: { name: '제휴 상품', saleType: 'affiliate', contact: 'seller@example.com', action: { url: 'http://unsafe.example.com' } } });
  assert.ok(affiliate.errors.some((value) => value.includes('HTTPS')));
});
