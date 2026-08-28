import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [api, automation, router, html, js, css, migration, registryText] = await Promise.all([
  read('affiliate-control.js'),
  read('coupang-partners-automation.js'),
  read('site-worker.js'),
  read('mall.html'),
  read('mall.js'),
  read('mall.css'),
  read('migrations/0047_ekodi_mall_auto_products.sql'),
  read('config/ecosystem-services.json'),
]);
const registry = JSON.parse(registryText);

test('EKODI Mall remains a root storefront separate from shared Shop platform', () => {
  const mall = registry.services.find(service => service.id === 'mall');
  const shop = registry.services.find(service => service.id === 'shop');
  assert.equal(mall.url, 'https://ekodi.kr/mall');
  assert.equal(mall.status, 'live');
  assert.equal(shop.url, 'https://shop.ekodi.kr');
  assert.equal(shop.status, 'planned');
  assert.equal(shop.homepage, false);
});

test('public storefront reads as a normal shopping mall', () => {
  assert.match(html, /EKODI MALL/);
  assert.match(html, /SMART SHOPPING/);
  assert.match(html, /오늘 필요한 것/);
  assert.match(html, /오늘의 상품/);
  assert.match(html, /상품 둘러보기/);
  assert.match(html, /새 상품을 준비하고 있습니다/);
  assert.doesNotMatch(html, /COUPANG AFFILIATE CURATION/);
  assert.doesNotMatch(html, /추천링크 클릭 후 검색하세요/);
  assert.doesNotMatch(html, /에코디 추천상품/);
});

test('official storefront canonical is ekodi.kr/mall', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/mall">/);
});

test('affiliate and seller disclosures appear before the product catalog, not in the footer', () => {
  const noticeIndex = html.indexOf('class="commerce-notice"');
  const catalogIndex = html.indexOf('class="catalog"');
  const footerIndex = html.indexOf('<footer>');
  assert.ok(noticeIndex > 0 && noticeIndex < catalogIndex);
  assert.ok(catalogIndex > 0 && catalogIndex < footerIndex);
  assert.match(html, /쿠팡 파트너스 활동의 일환으로/);
  assert.match(html, /판매·주문·결제·배송·교환·환불/);
  const footer = html.slice(footerIndex, html.indexOf('</footer>') + '</footer>'.length);
  assert.doesNotMatch(footer, /쿠팡 파트너스 활동의 일환으로/);
  assert.doesNotMatch(footer, /판매·주문·결제·배송·교환·환불/);
  assert.match(css, /\.commerce-notice/);
  assert.match(css, /footer\{[^}]*text-align:center/);
});

test('product cards support real images, prices, shipping badges and safe outbound clicks', () => {
  assert.match(js, /priceKrw/);
  assert.match(js, /imageUrl/);
  assert.match(js, /isRocket/);
  assert.match(js, /isFreeShipping/);
  assert.match(js, /상품보기/);
  assert.match(js, /sponsored noopener noreferrer/);
  assert.match(js, /FileReader/);
  assert.match(css, /product-media/);
  assert.match(css, /grid-template-columns:repeat\(4/);
});

test('mall has no fake or generic fallback products', () => {
  assert.doesNotMatch(js, /FALLBACK_PRODUCTS/);
  assert.doesNotMatch(js, /cwWXWm/);
  assert.doesNotMatch(api, /cwWXWm/);
  assert.doesNotMatch(api, /DEFAULT_AFFILIATE_URL/);
  assert.match(js, /state\.products = \[\]/);
});

test('automatic product search and partner link issuance are connected', () => {
  assert.match(automation, /TARGET_PRODUCTS = 24/);
  assert.match(automation, /searchSeed/);
  assert.match(automation, /issuePartnerLinks/);
  assert.match(automation, /createOpenAiProvider/);
  assert.match(automation, /balancedRules/);
  assert.match(api, /runAffiliateAutomation/);
  assert.match(api, /public-empty/);
  assert.match(api, /public-stale/);
});

test('public product, image and click paths run before admin authentication', () => {
  const authIndex = api.indexOf('const auth = await sessionCheck');
  assert.ok(authIndex > 0);
  assert.ok(api.indexOf("url.pathname === `${PREFIX}/public/products`") < authIndex);
  assert.ok(api.indexOf('publicImage(request, env, url)') < authIndex);
  assert.ok(api.indexOf('publicClick(request, env, url)') < authIndex);
  assert.match(api, /status: 302/);
});

test('automatic product schema is additive and stores provider facts', () => {
  for (const field of ['product_id', 'product_name', 'price_krw', 'image_url', 'affiliate_url', 'is_rocket', 'is_free_shipping', 'selection_source']) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /affiliate_recommendation_runs/);
  assert.match(migration, /affiliate_storefront_clicks/);
});

test('root router still publishes Mall page and assets on the apex host', () => {
  assert.match(router, /url\.pathname === '\/mall'/);
  assert.match(router, /public-ekodi-mall/);
  assert.match(router, /'\/mall\.css'/);
  assert.match(router, /'\/mall\.js'/);
});
