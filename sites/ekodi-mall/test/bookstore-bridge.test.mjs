// MALL-BOOKSTORE-BRIDGE-001
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { bookstoreProducts, approvedBookstoreProducts, loadBookstoreProducts, mergeBookstoreProducts } from '../scripts/bookstore-products.mjs';
import { isPublicStaticSale, isPublicBookInformation, isPublicIndexableProduct } from '../api/public-sale-visibility.js';

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

test('an existing publisher book is publicly indexable without pretending to be sale-ready', async () => {
  const titles = await loadBookstoreProducts(root);
  const book = titles.find(item => item.source?.bookId === 'BOOK-EKODI-000002');
  assert.ok(book, 'a catalog-authorized existing edition must retain its public information page');
  assert.equal(isPublicStaticSale(book), false, 'static release metadata is still incomplete');
  assert.equal(isPublicBookInformation(book), true);
  assert.equal(isPublicIndexableProduct(book), true);
  assert.equal(isPublicIndexableProduct({ ...book, published: false }), false);
  assert.equal(isPublicIndexableProduct({ ...book, source: { ...book.source, detailUrl: 'https://outside.invalid/books/fake' } }), false);
  assert.equal(isPublicIndexableProduct({ published: true, status: '출간 준비', saleType: 'publisher', category: 'book' }), false);
});

test('book detail purchase link opens only on a live file-ready server quote', async () => {
  const script = readFileSync(path.join(root, 'assets/bookstore-live.js'), 'utf8');
  async function detailFor(ready, { delayedApproval = false } = {}) {
    const elements = {
      '[data-bookstore-sale-status] dd': { textContent: '출간 준비 중' },
      '[data-bookstore-price]': { textContent: '가격 확인 필요' },
      '[data-bookstore-purchase-link]': {
        href: 'https://ekodi.kr/books/book/?id=BOOK-EKODI-000002',
        textContent: '상태 확인',
        classList: { add() {}, remove() {} }
      },
      '[data-bookstore-transaction-note]': { textContent: '' }
    };
    const calls = [];
    let refresh;
    let finishOldRequest;
    const bookId = 'BOOK-EKODI-000002';
    const quote = ready => ({
      book: { id: bookId },
      saleReadiness: { ready },
      checkout: { open: ready, fileReady: ready, saleReady: ready, mode: 'live' },
      price: { amount: 12345 }
    });
    const sandbox = {
      document: {
        body: { dataset: { bookstoreBookId: bookId } },
        getElementById() { return null; },
        querySelector(sel) { return elements[sel] || null; },
        querySelectorAll() { return []; },
        addEventListener(event, handler) { if (event === 'visibilitychange') refresh = handler; }
      },
      window: { location: { origin: 'https://ekodi.kr', pathname: '/ekodimall/products/book-test/' }, dispatchEvent() {} },
      fetch: async url => {
        calls.push(url);
        if (delayedApproval && calls.length === 1) {
          return new Promise(resolve => {
            finishOldRequest = () => resolve({ ok: true, json: async () => quote(true) });
          });
        }
        return { ok: true, json: async () => quote(ready) };
      },
      AbortSignal, URL, Intl, CustomEvent: class {},
    };
    vm.runInNewContext(script, sandbox, { filename: 'bookstore-live.js' });
    if (delayedApproval) {
      refresh();
      await new Promise(resolve => setImmediate(resolve));
      finishOldRequest();
    }
    await new Promise(resolve => setImmediate(resolve));
    return { elements, calls };
  }
  const approved = await detailFor(true);
  assert.equal(approved.elements['[data-bookstore-sale-status] dd'].textContent, '판매 중');
  assert.equal(approved.elements['[data-bookstore-price]'].textContent, '12,345원');
  assert.match(approved.elements['[data-bookstore-purchase-link]'].href, /\/ekodimall\/checkout\/book\/\?book=BOOK-EKODI-000002/);
  assert.equal(approved.calls.length, 1);
  const revoked = await detailFor(false);
  assert.equal(revoked.elements['[data-bookstore-sale-status] dd'].textContent, '판매 상태 확인 필요');
  assert.equal(revoked.elements['[data-bookstore-price]'].textContent, '가격 확인 필요');
  assert.match(revoked.elements['[data-bookstore-purchase-link]'].href, /\/books\/book\/\?id=BOOK-EKODI-000002/);
  assert.equal(revoked.calls.length, 1);
  const stale = await detailFor(false, { delayedApproval: true });
  assert.equal(stale.elements['[data-bookstore-sale-status] dd'].textContent, '판매 상태 확인 필요');
  assert.match(stale.elements['[data-bookstore-purchase-link]'].href, /\/books\/book\/\?id=BOOK-EKODI-000002/);
  assert.equal(stale.calls.length, 2);
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

test('direct-sale titles are bought directly in the mall checkout (source: bookstore)', () => {
  const [direct] = bookstoreProducts({ books: [{ id: 'BOOK-EKODI-000001', catalogNo: 'EB-MONO-001', title: '에코디언을 찾아서', author: '정찬균', edition: 'v1', workflow: { manuscript: 'complete', editing: 'complete', epub: 'validated', cover: 'complete', metadata: 'ready', storefront: 'live' }, listPrice: { amount: 9900 }, links: { upaper: 'https://ekodi.upaper.kr/content/1' }, directSale: { enabled: true, fileKey: 'BOOK-EKODI-000001/ebook.epub' } }] });
  assert.equal(direct.action.url, 'https://ekodi.kr/ekodimall/checkout/book/?book=BOOK-EKODI-000001');
  assert.equal(direct.action.label, '에코디몰에서 바로 구매');
  assert.equal(direct.badge, '에코디서점');
});

test('unready direct-sale titles are shown in the mall but never as on sale', () => {
  const [p] = bookstoreProducts({ books: [{ id: 'BOOK-EKODI-000002', catalogNo: 'EB-MONO-002', title: 'AI 시대의 진보와 빈곤', author: '정찬균', listPrice: { amount: 9900 }, links: {}, directSale: { enabled: true, fileKey: 'BOOK-EKODI-000002/ebook.epub' }, edition: '', workflow: { epub: 'needs_verification' } }] });
  assert.equal(p.action.type, 'inquiry');
  assert.equal(p.status, '출간 준비 중');
  assert.equal(p.featured, false);
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
  const book={id:'BOOK-NEW-000003',title:'승인된 도서',author:'정찬균',catalogNo:'EB-NEW-003',
    links:{},listPrice:{amount:9900,currency:'KRW'},directSale:{enabled:true,fileKey:'BOOK-NEW-000003/ebook.epub'},edition:'v1',
    workflow:{manuscript:'complete',editing:'complete',epub:'validated',cover:'complete',metadata:'ready',storefront:'live'},
    publisherRelease:{publicationId:'pub-003',editionId:'edition-003',
      releaseDigest:'sha256:'+'f'.repeat(64)}};
  assert.deepEqual(await approvedBookstoreProducts({books:[book]},null),[]);
  const gate={verifyPublicRelease:async request=>({authorized:true,state:'released',
    visibility:'public',checkoutEnabled:true,...request,
    retailIdentityVersion:1,bookId:book.id,catalogNo:book.catalogNo,
    title:book.title,author:book.author,fileKey:book.directSale.fileKey,
    priceKrw:book.listPrice.amount,currency:'KRW'})};
  const visible=await approvedBookstoreProducts({books:[book]},gate);
  assert.equal(visible.length,1);
  assert.equal(visible[0].action.url,'https://ekodi.kr/ekodimall/checkout/book/?book=BOOK-NEW-000003');
  const mismatched={verifyPublicRelease:async request=>({authorized:true,state:'released',
    visibility:'public',checkoutEnabled:true,...request,channel:'books'})};
  assert.deepEqual(await approvedBookstoreProducts({books:[book]},mismatched),[]);
});

test('EKODI Books storefront reflects real approval and sold-book counts', () => {
  const template = readFileSync(path.join(root, 'src/store.template.html'), 'utf8');
  const builder = readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8');
  const client = readFileSync(path.join(root, 'assets/bookstore-live.js'), 'utf8');
  for (const key of ['STORE_BOOKS_ATTR','STORE_BOOKS_SCRIPT','STORE_BOOK_GRID_ATTR','STORE_STATUS_ATTR','STORE_COUNT_ATTR']) {
    assert.ok(template.includes(key), 'missing dynamic bookstore control ' + key);
    assert.ok(builder.includes(key), 'builder must provide ' + key);
  }
  assert.ok(client.includes('[data-bookstore-store-grid]'));
  assert.ok(client.includes('[data-bookstore-public-count]'));
  assert.ok(client.includes("setSection('STATUS'"));
  assert.ok(client.includes("setSection('COMMERCE'"));
});

test('every mall static template omits the obsolete commerce V2 notice strip', () => {
  for (const name of ['affiliate-hub', 'checkout', 'index', 'page', 'product', 'seller', 'store']) {
    const html = readFileSync(path.join(root, 'src', name + '.template.html'), 'utf8');
    assert.doesNotMatch(html, /class="notice"[^>]*>\{\{NOTICE\}\}/);
  }
  const site = JSON.parse(readFileSync(path.join(root, 'content/site.json'), 'utf8'));
  assert.equal(site.notice, '');
});
test('book details use compact headings and an explicit responsive artwork layout', () => {
  const template = readFileSync(path.join(root, 'src/product.template.html'), 'utf8');
  const builder = readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8');
  const css = readFileSync(path.join(root, 'assets/product-detail.css'), 'utf8');
  assert.match(template, /\{\{PRODUCT_HEADING\}\}/);
  assert.match(template, /\{\{PRODUCT_SUBTITLE\}\}/);
  assert.match(builder, /product\.category === 'book'/);
  assert.match(css, /\.product-detail-v2 \.detail-copy h1/);
  assert.match(css, /align-items:start/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('mall book checkout pages are built, record the mall channel and show the bookstore source', () => {
  const template = readFileSync(path.join(root, 'src/book-checkout.template.html'), 'utf8');
  const builder = readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8');
  const client = readFileSync(path.join(root, 'assets/book-checkout.js'), 'utf8');
  assert.match(template, /data-books-api-base="\/books"/);
  assert.match(template, /https:\/\/ekodi\.kr\/books\/buy\/commerce-client\.js/);
  for (const page of ['checkout/book/index.html', 'checkout/book/success/index.html', 'checkout/book/fail/index.html']) assert.ok(builder.includes(page));
  assert.ok(builder.includes('출처 · 에코디서점'));
  assert.match(client, /source: 'mall'/);
  assert.ok(client.includes('ekodimall\\/checkout\\/book\\/success'));
  assert.doesNotMatch(client, /accounts\.google\.com/);
});
