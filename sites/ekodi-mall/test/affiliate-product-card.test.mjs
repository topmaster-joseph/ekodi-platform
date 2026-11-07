import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  safeAffiliateHttps, affiliateProviderMatches, conciseAffiliateDescription,
  affiliatePriceLabel
} from '../assets/affiliate-share.js';

test('only exact approved merchant identity can enter Coupang or Agoda card', () => {
  assert.equal(affiliateProviderMatches({providerKey:'coupang_partners'},['coupang','coupang-partners']), true);
  assert.equal(affiliateProviderMatches({providerKey:'agoda'},['coupang','coupang-partners']), false);
  assert.equal(affiliateProviderMatches({providerKey:'other',providerName:'Coupang'},['coupang']), false);
  assert.equal(affiliateProviderMatches({providerKey:'network',merchantKey:'agoda'},['agoda']), true);
  assert.equal(affiliateProviderMatches({providerKey:'coupang',merchantKey:'other'},['coupang']), false);
});

test('images and external links must use HTTPS and cannot contain embedded secrets', () => {
  assert.equal(safeAffiliateHttps('https://ekodi.kr/api/affiliate/public/image/4'), 'https://ekodi.kr/api/affiliate/public/image/4');
  assert.equal(safeAffiliateHttps('http://example.org/img.jpg'), '');
  assert.equal(safeAffiliateHttps('javascript:alert(1)'), '');
  assert.equal(safeAffiliateHttps('https://account:password@example.org/item'), '');
  assert.equal(safeAffiliateHttps('/relative.jpg'), '');
});

test('cards show only supplied facts and label unknown prices honestly', () => {
  assert.equal(affiliatePriceLabel({priceKrw:33050}), '33,050원');
  assert.equal(affiliatePriceLabel({priceKrw:0}), '가격은 판매처에서 확인');
  assert.equal(conciseAffiliateDescription({category:'생활',isRocket:true}), '생활 · 로켓배송');
  assert.equal(conciseAffiliateDescription({productName:'아무 이름',category:''}), '상세 조건은 판매처에서 확인해 주세요.');
  assert.ok(conciseAffiliateDescription({description:'가'.repeat(150)}).length<=62);
});

test('affiliate list shows image/detail without guessing a missing image', () => {
  const source=readFileSync(new URL('../assets/affiliate-hub.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../src/affiliate-hub.template.html',import.meta.url),'utf8');
  assert.match(source,/safeHttps\(item\?\.imageUrl\)/);
  assert.match(source,/이미지 준비 중/);
  assert.match(source,/thumbButton\.addEventListener\('click',\(\)=>showDetail\(item\)\)/);
  assert.match(source,/title\.addEventListener\('click',\(\)=>showDetail\(item\)\)/);
  assert.match(source,/detail\.showModal\(\)/);
  assert.match(source,/noopener sponsored/);
  assert.match(html,/id="affiliateProductDialog"/);
});
