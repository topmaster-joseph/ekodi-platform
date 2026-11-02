import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = name => readFileSync(new URL(name, import.meta.url),'utf8');
test('Seller Studio only loads seller-owned server products, no platform-wide inventory', () => {
  const js = source('../assets/seller-server.js');
  assert.match(js, /api\('\/api\/products'\)/);
  assert.doesNotMatch(js, /\/api\/internal\/products\/by-provider|operatorScope|externalFeedState|readCatalogs/);
  assert.match(js,/sellerProducts\s*=\s*Array\.isArray\(productsResult\.products\)/);
  assert.match(js,/renderProviderProducts\(\)/);
});
test('Seller Studio has compact table and wizard defaults to owned listing', () => {
  const js = source('../assets/seller-server.js');
  const wizard = source('../assets/seller-wizard.js');
  const css = source('../assets/seller-providers.css');
  const template = source('../src/seller.template.html');
  assert.match(js, /seller-inventory-table/);
  assert.match(js, /내 등록 상품/);
  assert.match(js, /공급처 필터/);
  assert.match(wizard, /data-wz-inventory/);
  assert.match(wizard, /wz-inventory/);
  assert.match(wizard, /showInventory\(\)/);
  assert.match(css,/seller-inventory-scroll\{overflow-x:auto/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(template, /seller-provider-catalog\.js/);
});
test('Candidate supplier registry includes Agoda, Trip.com, and verified-source boundaries', () => {
  const registry = JSON.parse(source('../assets/provider-registry.json'));
  assert.ok(registry.providers.length >= 10);
  const map = new Map(registry.providers.map(p => [p.id, p]));
  assert.equal(map.get('agoda').type, 'travel_affiliate');
  assert.equal(map.get('tripcom').type, 'travel_affiliate');
  assert.equal(map.get('bookstore').type, 'publisher');
  assert.equal(map.get('domeggook').type, 'supplier_dropship');
  assert.match(map.get('agoda').status, /확인 필요/);
  for (const p of registry.providers) assert.ok(!('autoOrderEnabled' in p) && !('paymentEnabled' in p));
});
