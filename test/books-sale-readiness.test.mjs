// BOOKS-SALE-READINESS-001 — directSale.enabled alone never opens a sale.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { saleReadiness, SALE_READY_WORKFLOW } from '../books-sale-readiness.js';
import { createOrder, confirm, quote } from '../books-commerce.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));
const byId = id => catalog.books.find(b => b.id === id);

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } });
  return { raw: db, prepare: sql => stmt(sql), batch: async list => { for (const s of list) await s.run(); } };
}
const envFor = (db, cat = catalog) => ({ DB: db, ASSETS: { fetch: async req => new Response(JSON.stringify(new URL(req.url).pathname === '/books.json' ? cat : policy)) }, BOOK_FILES: { head: async () => ({ size: 1 }) }, PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_abc', TOSS_SECRET_KEY: 'live_sk_abc', OPERATOR_EMAILS: 'op@ekodi.kr', PUBLIC_BASE_URL: 'https://ekodi.kr/books' });
const asUser = email => ({ id: 'u-' + email, email, email_confirmed_at: '2026-01-01', user_metadata: {} });
let current = asUser('reader@example.com');
const realFetch = globalThis.fetch;
test.beforeEach(() => { current = asUser('reader@example.com'); globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? new Response(JSON.stringify(current)) : realFetch(url); });
test.afterEach(() => { globalThis.fetch = realFetch; });
const req = () => new Request('https://ekodi.kr/books/api/commerce/orders', { method: 'POST', headers: { authorization: 'Bearer t' } });

test('existing book 1 (live on Upaper, validated EPUB) stays sale-ready; data preserved', () => {
  const b = byId('BOOK-EKODI-000001');
  assert.deepEqual(saleReadiness(b), { ready: true, reasons: [], label: '' });
  assert.equal(b.links.upaper, 'https://ekodi.upaper.kr/content/1223429');
  assert.equal(b.listPrice.amount, 9900);
  assert.equal(b.directSale.fileKey, 'BOOK-EKODI-000001/ebook.epub');
});

test('book 2 with directSale.enabled but unverified workflow is NOT sale-ready', () => {
  const b = byId('BOOK-EKODI-000002');
  assert.equal(b.directSale.enabled, true, 'flag preserved, not deleted');
  const r = saleReadiness(b);
  assert.equal(r.ready, false);
  assert.equal(r.label, '출간 준비 중');
  assert.ok(r.reasons.includes('EDITION_UNAPPROVED'));
});

test('fail closed on missing or partial evidence', () => {
  assert.equal(saleReadiness(null).ready, false);
  const ok = byId('BOOK-EKODI-000001');
  for (const step of Object.keys(SALE_READY_WORKFLOW)) {
    assert.equal(saleReadiness({ ...ok, workflow: { ...ok.workflow, [step]: 'needs_verification' } }).ready, false, step);
  }
  assert.equal(saleReadiness({ ...ok, listPrice: { amount: 0 } }).label, '가격 확정 전');
  assert.equal(saleReadiness({ ...ok, directSale: { enabled: true } }).ready, false);
  assert.equal(saleReadiness({ ...ok, workflow: { ...ok.workflow, storefront: 'catalog_listed' } }).label, '판매처 등록 중');
});

test('server refuses order for unready book, even for operators and with file present', async () => {
  for (const email of ['reader@example.com', 'op@ekodi.kr']) {
    current = asUser(email);
    const db = d1();
    const r = await createOrder(envFor(db), req(), { bookId: 'BOOK-EKODI-000002', consent: true });
    assert.equal(r.status, 409, email);
    assert.equal(r.data.code, 'BOOK_NOT_SALE_READY');
    assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM books_orders').get().c, 0);
  }
});

test('quote reports the real status and keeps checkout closed', async () => {
  const r = await quote(envFor(d1()), new Request('https://x/'), 'BOOK-EKODI-000002');
  assert.equal(r.status, 200);
  assert.equal(r.data.checkout.open, false);
  assert.equal(r.data.checkout.saleReady, false);
  assert.equal(r.data.checkout.saleStatus, '출간 준비 중');
  const ok = await quote(envFor(d1()), new Request('https://x/'), 'BOOK-EKODI-000001');
  assert.equal(ok.data.checkout.open, true, 'book 1 regression: still sellable when payments live and file present');
});

test('readiness revoked after order creation blocks charging before Toss is called', async () => {
  const db = d1();
  const created = await createOrder(envFor(db), req(), { bookId: 'BOOK-EKODI-000001', consent: true });
  assert.equal(created.status, 201);
  const revoked = structuredClone(catalog);
  revoked.books[0].workflow.storefront = 'paused';
  let calls = 0;
  const r = await confirm(envFor(db, revoked), { paymentKey: 'pk', orderId: created.data.orderId, amount: created.data.amount }, new Date(), async () => { calls++; return {}; });
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'BOOK_NOT_SALE_READY');
  assert.equal(calls, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM books_entitlements').get().c, 0);
});

test('storefront client mirror agrees with server rule and gates the buy button', () => {
  const src = fs.readFileSync(new URL('../books/app.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('// BOOKS-SALE-READINESS-001'), src.indexOf('// END BOOKS-SALE-READINESS-001'));
  const ctx = {}; vm.runInNewContext(block + ';this.f=bookSaleReady;', ctx);
  const ok = byId('BOOK-EKODI-000001');
  const cases = [...catalog.books, null, { ...ok, edition: '' }, { ...ok, workflow: { ...ok.workflow, epub: 'draft' } }, { ...ok, directSale: { enabled: false, fileKey: 'x' } }];
  for (const c of cases) assert.equal(ctx.f(c), saleReadiness(c).ready);
  assert.match(src, /if\(bookSaleReady\(book\)\|\|book\._approved\)\{const buy=/);
  assert.doesNotMatch(src, /if\(book\.directSale\?\.enabled\)\{const buy=/);
});
