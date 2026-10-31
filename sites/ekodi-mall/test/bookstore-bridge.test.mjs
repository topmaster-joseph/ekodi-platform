// MALL-BOOKSTORE-BRIDGE-001
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookstoreProducts, approvedBookstoreProducts, loadBookstoreProducts, mergeBookstoreProducts } from '../scripts/bookstore-products.mjs';

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
    { id: 'BOOK-EKODI-000001', catalogNo: 'EB-MONO-001', title: '에코디언을 찾아서', author: '정찬균', listPrice: { amount: 9900 }, links: { upaper: 'https://ekodi.upaper.kr/content/1' } },
    { id: 'BOOK-EKODI-000002', catalogNo: 'EB-MONO-002', title: 'AI 시대의 진보와 빈곤', author: '정찬균', listPrice: { amount: 9900 }, links: {}, detailUrl: '/#catalog' }
  ] });
  assert.equal(onSale.action.type, 'external');
  assert.equal(onSale.status, '판매 중');
  assert.equal(pending.action.type, 'inquiry');
  assert.equal(pending.action.url, 'https://ekodi.kr/books/#catalog');
  assert.equal(pending.status, '판매처 등록 준비 중');
});

test('direct-sale titles send mall buyers to the bookstore checkout', () => {
  const [direct] = bookstoreProducts({ books: [{ id: 'BOOK-EKODI-000001', catalogNo: 'EB-MONO-001', title: '에코디언을 찾아서', author: '정찬균', listPrice: { amount: 9900 }, links: { upaper: 'https://ekodi.upaper.kr/content/1' }, directSale: { enabled: true, fileKey: 'BOOK-EKODI-000001/ebook.epub' } }] });
  assert.equal(direct.action.url, 'https://ekodi.kr/books/buy/?book=BOOK-EKODI-000001&from=mall');
  assert.equal(direct.action.label, '에코디서점에서 구매하기');
});

test('hand-curated mall products win over mirrored ones', () => {
  const merged = mergeBookstoreProducts([{ id: 'bookstore-A', slug: 'x' }], [{ id: 'bookstore-A', slug: 'y' }, { id: 'n', slug: 'n' }]);
  assert.deepEqual(merged.map((p) => p.id), ['bookstore-A', 'n']);
});


test('a new private book is NOT mirrored even if its static JSON claims on sale', () => {
  const forged={id:'BOOK-NEW-000003',title:'비공개 출판 예약 도서',author:'정찬균',
    status:'On Sale',published:true,directSale:{enabled:true},
    links:{upaper:'https://example.com/unauthorized'},listPrice:{amount:9900},
    publisherRelease:{publicationId:'pub-003',editionId:'edition-003',releaseDigest:'sha256:'+'f'.repeat(64),
      approved:true,checkoutEnabled:true}};
  assert.deepEqual(bookstoreProducts({books:[forged]}),[]);
});
test('verified publishing service can safely include NEW editions in runtime mall projection', async()=>{
  const book={id:'BOOK-NEW-000003',title:'승인된 도서',author:'정찬균',
    links:{},listPrice:{amount:9900},directSale:{enabled:true},
    publisherRelease:{publicationId:'pub-003',editionId:'edition-003',
      releaseDigest:'sha256:'+'f'.repeat(64)}};
  assert.deepEqual(await approvedBookstoreProducts({books:[book]},null),[]);
  const gate={verifyPublicRelease:async request=>({authorized:true,state:'released',
    visibility:'public',checkoutEnabled:true,...request})};
  const visible=await approvedBookstoreProducts({books:[book]},gate);
  assert.equal(visible.length,1);
  assert.equal(visible[0].action.url,'https://ekodi.kr/books/buy/?book=BOOK-NEW-000003&from=mall');
  const mismatched={verifyPublicRelease:async request=>({authorized:true,state:'released',
    visibility:'public',checkoutEnabled:true,...request,channel:'books'})};
  assert.deepEqual(await approvedBookstoreProducts({books:[book]},mismatched),[]);
});
