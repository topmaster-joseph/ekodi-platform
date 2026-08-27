import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [api, admin, router, html, js, registryText] = await Promise.all([
  read('affiliate-control.js'), read('marketing-funnel-admin.js'), read('site-worker.js'),
  read('mall.html'), read('mall.js'), read('config/ecosystem-services.json'),
]);
const registry = JSON.parse(registryText);

test('EKODI Mall is a root storefront, separate from shared Shop platform', () => {
  const mall = registry.services.find(service => service.id === 'mall');
  const shop = registry.services.find(service => service.id === 'shop');
  assert.equal(mall.url, 'https://ekodi.kr/mall');
  assert.equal(mall.status, 'live');
  assert.equal(shop.url, 'https://shop.ekodi.kr');
  assert.equal(shop.status, 'planned');
  assert.equal(shop.homepage, false);
});

test('public storefront is read-only and admin mutation remains authenticated', () => {
  assert.match(api, /\$\{PREFIX\}\/public\/products/);
  assert.ok(api.indexOf("url.pathname === `${PREFIX}/public/products`") < api.indexOf('const auth = await sessionCheck'));
  assert.match(api, /PUBLIC_STOREFRONT_SLUG = 'ekodi-mall'/);
  assert.match(api, /https:\/\/link\.coupang\.com\/a\/cwWXWm/);
  assert.match(admin, /publishToEkodiMall/);
});

test('storefront carries disclosure, recommendation instruction and safe sponsored links', () => {
  assert.match(html, /COUPANG AFFILIATE CURATION/);
  assert.match(html, /쿠팡 파트너스 활동의 일환으로/);
  assert.match(html, /아래 추천링크 클릭 후 검색하세요/);
  assert.match(js, /rel = 'sponsored noopener noreferrer'/);
  assert.match(js, /https:\/\/api\.ekodi\.kr\/api\/affiliate\/public\/products/);
});

test('root router publishes only Mall page and assets on the apex host', () => {
  assert.match(router, /url\.pathname === '\/mall'/);
  assert.match(router, /public-ekodi-mall/);
  assert.match(router, /'\/mall\.css'/);
  assert.match(router, /'\/mall\.js'/);
});

test('public storefront never mutates schema and has a safe fallback product', () => {
  const start = api.indexOf("url.pathname === `${PREFIX}/public/products`");
  const end = api.indexOf('const auth = await sessionCheck', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(api.slice(start, end), /ensureSchema/);
  assert.match(api, /if \(!products\.length\) products = \[/);
});
