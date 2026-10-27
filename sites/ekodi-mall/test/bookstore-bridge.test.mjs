// MALL-BOOKSTORE-BRIDGE-001
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookstoreProducts, loadBookstoreProducts, mergeBookstoreProducts } from '../scripts/bookstore-products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every bookstore title is mirrored into the 책·배움 corner', async () => {
  const mirrored = await loadBookstoreProducts(root);
  assert.ok(mirrored.length >= 2);
  for (const product of mirrored) {
    assert.equal(product.category, 'book');
    assert.equal(product.storeId, 'store-ekodi-books');
    assert.equal(product.saleType, 'publisher');
    assert.match(product.slug, /^[a-z0-9-]+$/);
    assert.match(product.action.url, /^https:\/\//);
  }
  assert.ok(mirrored.some((product) => product.name.startsWith('에코디언을 찾아서')));
  assert.ok(mirrored.some((product) => product.name.startsWith('AI 시대의 진보와 빈곤')));
});

test('a sale link opens a purchase button; no link never pretends to sell', () => {
  const [onSale, pending] = bookstoreProducts({ books: [
    { id: 'A', catalogNo: 'EB-1', title: 'A', author: 'x', listPrice: { amount: 9900 }, links: { upaper: 'https://ekodi.upaper.kr/content/1' } },
    { id: 'B', catalogNo: 'EB-2', title: 'B', author: 'x', listPrice: { amount: 9900 }, links: {}, detailUrl: '/#catalog' }
  ] });
  assert.equal(onSale.action.type, 'external');
  assert.equal(onSale.status, '판매 중');
  assert.equal(pending.action.type, 'inquiry');
  assert.equal(pending.action.url, 'https://ekodi.kr/books/#catalog');
  assert.equal(pending.status, '판매처 등록 준비 중');
});

test('direct-sale titles send mall buyers to the bookstore checkout', () => {
  const [direct] = bookstoreProducts({ books: [{ id: 'BOOK-X', catalogNo: 'EB-9', title: 'X', author: 'x', listPrice: { amount: 9900 }, links: { upaper: 'https://ekodi.upaper.kr/content/1' }, directSale: { enabled: true } }] });
  assert.equal(direct.action.url, 'https://ekodi.kr/books/buy/?book=BOOK-X&from=mall');
  assert.equal(direct.action.label, '에코디서점에서 구매하기');
});

test('hand-curated mall products win over mirrored ones', () => {
  const merged = mergeBookstoreProducts([{ id: 'bookstore-A', slug: 'x' }], [{ id: 'bookstore-A', slug: 'y' }, { id: 'n', slug: 'n' }]);
  assert.deepEqual(merged.map((p) => p.id), ['bookstore-A', 'n']);
});
