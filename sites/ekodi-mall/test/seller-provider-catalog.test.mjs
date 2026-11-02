import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/seller-provider-catalog.js', import.meta.url), 'utf8');
const context = { window: {}, URL };
vm.runInNewContext(source, context);
const { affiliateRows, bookstoreRows, readCatalogs } = context.window.ekodiMallProviderCatalog;

test('bookstore mirror keeps approved titles read-only, separated from Mall checkout', () => {
  const items = bookstoreRows([
    { id: 'bookstore-BOOK-EKODI-000001', name: '에코디언을 찾아서', saleReady: true, detailUrl: 'https://ekodi.kr/ekodimall/products/book-1/' },
    { id: 'bookstore-BOOK-EKODI-000002', name: '출간 준비 중', saleReady: false, detailUrl: 'https://ekodi.kr/ekodimall/products/book-2/' },
    { id: 'hidden', name: '외부 공격', saleReady: true, detailUrl: 'https://bad.example/phishing' }
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].source.kind, 'ekodi-bookstore');
  assert.equal(items[0].externalReady, true);
  assert.equal(items[1].externalReady, false);
  assert.equal(items[0].readOnly, true);
  assert.ok(!('checkoutReady' in items[0]));
});

test('Coupang public feed appears as external checkout instead of being miscounted as own stock', () => {
  const rows = affiliateRows([
    { providerKey: 'coupang_partners', productId: '123', productName: '겨울 의류', clickUrl: 'https://ekodi.kr/api/affiliate/public/click/123?storefront=ekodi-mall' },
    { providerKey: 'amazon', productId: '456', productName: '다른 제휴', clickUrl: 'https://ekodi.kr/api/affiliate/public/click/456' },
    { providerKey: 'coupang_partners', productId: '789', productName: '나쁜 주소', clickUrl: 'https://example.org/unsafe' }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source.kind, 'coupang_partners');
  assert.equal(rows[0].product.saleType, 'affiliate');
  assert.equal(rows[0].readOnly, true);
  assert.match(rows[0].externalUrl, /^https:\/\/ekodi\.kr\/api\/affiliate\/public\/click\//);
});

test('source errors stay distinguishable from zero products', async () => {
  const result = await readCatalogs(async url => {
    if (url.includes('provider-bookstore')) return new Response(JSON.stringify({ products: [
      { id: 'b1', name: '책', detailUrl: 'https://ekodi.kr/books/', saleReady: true }
    ] }));
    throw new Error('temporary feed outage');
  });
  assert.equal(result.status.bookstore, 'ok');
  assert.equal(result.status.coupang, 'error');
  assert.equal(result.rows.length, 1);
});

test('both independent feeds merge without duplicating a provider product id', async () => {
  const r = await readCatalogs(async url => new Response(JSON.stringify({ products: url.includes('provider-bookstore')
    ? [{ id: 'b1', name: '책', detailUrl: '/ekodimall/products/book-a/', saleReady: false }]
    : [
      { providerKey: 'coupang_partners', productId: '10', productName: '연필', clickUrl: 'https://ekodi.kr/api/affiliate/public/click/10' },
      { providerKey: 'coupang_partners', productId: '10', productName: '연필', clickUrl: 'https://ekodi.kr/api/affiliate/public/click/10' }
    ] })));
  assert.equal(r.rows.length, 2);
  assert.equal(r.status.bookstore, 'ok');
  assert.equal(r.status.coupang, 'ok');
});
