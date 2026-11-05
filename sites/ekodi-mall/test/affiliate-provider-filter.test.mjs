import test from 'node:test';
import assert from 'node:assert/strict';
import { providerMatches, safeAffiliateHttps } from '../assets/affiliate-provider-filter.js';

test('Coupang affiliate hub accepts Coupang Partners only by official source key', () => {
  assert.equal(providerMatches({ providerKey:'coupang_partners', providerName:'Coupang' }, ['coupang_partners']), true);
  assert.equal(providerMatches({ providerKey:'coupang', providerName:'Coupang' }, ['coupang_partners']), true);
  assert.equal(providerMatches({ providerKey:'agoda', productName:'쿠팡 선물', merchantName:'쿠팡파트너스' }, ['coupang_partners']), false);
  assert.equal(providerMatches({ providerKey:'amazon', providerName:'쿠팡 파트너스' }, ['coupang_partners']), false);
  assert.equal(providerMatches({ providerKey:'coupang_partners', merchantKey:'another_vendor' }, ['coupang_partners']), false);
});

test('Agoda travel hub allows verified Agoda merchant through a network but excludes other travel sellers', () => {
  assert.equal(providerMatches({ providerKey:'agoda' }, ['agoda']), true);
  assert.equal(providerMatches({ providerKey:'linkprice', merchantKey:'agoda' }, ['agoda']), true);
  assert.equal(providerMatches({ providerKey:'hotel_vendor', merchantName:'Agoda 추천상품' }, ['agoda']), false);
  assert.equal(providerMatches({ providerKey:'coupang_partners' }, ['agoda']), false);
});

test('affiliate links are HTTPS only and must not carry embedded credentials', () => {
  assert.equal(safeAffiliateHttps('https://ekodi.kr/api/affiliate/public/click/1'), 'https://ekodi.kr/api/affiliate/public/click/1');
  assert.equal(safeAffiliateHttps('http://example.com/x'), '');
  assert.equal(safeAffiliateHttps('javascript:alert(1)'), '');
  assert.equal(safeAffiliateHttps('https://user:password@example.com/'), '');
  assert.equal(safeAffiliateHttps('/relative/path'), '');
});
