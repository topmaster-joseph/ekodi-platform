import test from 'node:test';
import assert from 'node:assert/strict';
import {validAffiliateProductId, sharedProductId, shareUrlForProduct, prioritizeSharedProduct, validatedAgodaPartnerSearch, trackedAgodaPartnerSearch} from '../assets/affiliate-share.js';

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

test('owner generated Agoda search link is strictly scoped and does not authorize a product catalog', () => {
  const link = 'https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr';
  assert.equal(validatedAgodaPartnerSearch(link), link);
  for (const bad of [
    'http://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr',
    'https://www.agoda.com.evil.example/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr',
    'https://user:pass@www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr',
    'https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr&redirect=https://evil.example',
    'https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&cid=1980073&hl=ko-kr',
    'https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=not-a-cid&hl=ko-kr',
    'https://www.agoda.com/partners/partnersearch.aspx?pcs=0&cid=1980072&hl=ko-kr',
    'https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=en-us',
    'javascript:alert(1)',
    ''
  ]) assert.equal(validatedAgodaPartnerSearch(bad), '', bad);
});

test('Agoda generated report tags retain CID and reject user identifiers or link substitutions', () => {
  const base = 'https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1980072&hl=ko-kr';
  const expected = base + '&tag=ekodi_mall_stay';
  assert.equal(trackedAgodaPartnerSearch(base, 'ekodi_mall_stay'), expected);
  assert.equal(new URL(expected).searchParams.get('cid'), '1980072');
  assert.equal(new URL(expected).searchParams.get('tag'), 'ekodi_mall_stay');
  for (const bad of [
    '', 'ekodi_mall', 'ekodi_mall_stay_2026', 'ekodi_mall_stay&cid=1111111',
    'ekodi_mall_01012345678@example.com', 'ekodi_mall_/escape', 'ekodi_mall_가나다',
    'EKODI_mall_stay', 'ekodi_mall_stay?redirect=evil.example'
  ]) assert.equal(trackedAgodaPartnerSearch(base, bad), '', bad);
  assert.equal(trackedAgodaPartnerSearch(base + '&tag=old_tag_here', 'ekodi_mall_stay'), '');
  assert.equal(trackedAgodaPartnerSearch('https://evil.example/', 'ekodi_mall_stay'), '');
});
