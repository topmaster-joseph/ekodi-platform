import test from 'node:test';
import assert from 'node:assert/strict';
import {validAffiliateProductId, sharedProductId, shareUrlForProduct, prioritizeSharedProduct} from '../assets/affiliate-share.js';

test('canonical Mall share URLs contain only a validated product ID', () => {
  assert.equal(shareUrlForProduct('https://ekodi.kr/ekodimall/coupang/?foo=secret#section', 5277), 'https://ekodi.kr/ekodimall/coupang/?product=5277');
  assert.equal(shareUrlForProduct('https://ekodi.kr/ekodimall/travel/stay/', 80), 'https://ekodi.kr/ekodimall/travel/stay/?product=80');
  assert.equal(shareUrlForProduct('https://ekodi.kr/my/invest', 5277), '');
  assert.equal(shareUrlForProduct('https://ekodi.kr/ekodimall/coupang/', '../hack'), '');
  assert.equal(shareUrlForProduct('javascript:alert(1)', 5277), '');
  assert.ok(validAffiliateProductId('5277'));
  assert.equal(validAffiliateProductId('0'), false);
  assert.equal(validAffiliateProductId('12&redirect=example.com'), false);
});

test('sharing strips unrelated parameters and allows no redirect target', () => {
  assert.equal(shareUrlForProduct('https://bad.example/ekodimall/coupang/?access_token=private', 5277), 'https://ekodi.kr/ekodimall/coupang/?product=5277');
  assert.equal(sharedProductId('?product=5277&utm=campaign'), '5277');
  assert.equal(sharedProductId('?product=%3Cscript%3E'), '');
  assert.equal(sharedProductId('?product=0'), '');
  assert.equal(sharedProductId('?product=99999999999999999999'), '');
});

test('deep link prioritizes an existing item and never substitutes unavailable items', () => {
  const products = [{ id: 1 }, { id: 5277 }, { id: 3 }];
  const matched = prioritizeSharedProduct(products, '5277');
  assert.equal(matched.matched, true);
  assert.deepEqual(matched.products.map(item => item.id), [5277, 1, 3]);
  assert.deepEqual(products.map(item => item.id), [1, 5277, 3]);
  const missing = prioritizeSharedProduct(products, '999');
  assert.equal(missing.matched, false);
  assert.deepEqual(missing.products, products);
});
