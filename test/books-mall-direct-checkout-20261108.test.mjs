// MALL-BOOKS-DIRECT-CHECKOUT-001 — 에코디몰 책·배움 직접판매: 몰 결제 반환 주소, 판매채널 기록, 서점 관리자 채널별 모니터링.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createOrder, confirm, adminRoute, orderChannel } from '../books-commerce.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } });
  return { raw: db, prepare: sql => stmt(sql), batch: async list => { db.exec('BEGIN'); try { for (const s of list) await s.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
const assets = { fetch: async req => new Response(JSON.stringify(new URL(req.url).pathname === '/books.json' ? catalog : policy), { status: 200 }) };
const files = { head: async key => (/ebook\.epub$/.test(key) ? { size: 1 } : null) };
const env = db => ({ DB: db, ASSETS: assets, BOOK_FILES: files, PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_abc', TOSS_SECRET_KEY: 'live_sk_abc', OPERATOR_EMAILS: 'op@ekodi.kr', PUBLIC_BASE_URL: 'https://ekodi.kr/books' });
let current = { id: 'u-1', email: 'reader@example.com', email_confirmed_at: '2026-01-01', user_metadata: { name: '독자' } };
const req = () => new Request('https://ekodi.kr/books/api/commerce/orders', { method: 'POST', headers: { authorization: 'Bearer tok' } });
const realFetch = globalThis.fetch;
test.beforeEach(() => { globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? new Response(JSON.stringify(current)) : realFetch(url); });
test.afterEach(() => { globalThis.fetch = realFetch; current = { id: 'u-1', email: 'reader@example.com', email_confirmed_at: '2026-01-01', user_metadata: { name: '독자' } }; });

test('channel whitelist: only mall/ekodimall map to mall; anything else is bookstore', () => {
  assert.equal(orderChannel('mall'), 'mall');
  assert.equal(orderChannel('EKODIMALL'), 'mall');
  assert.equal(orderChannel('bookstore'), 'bookstore');
  assert.equal(orderChannel('<script>'), 'bookstore');
  assert.equal(orderChannel(undefined), 'bookstore');
});

test('mall orders return to the mall checkout and are recorded as the mall channel', async () => {
  const db = d1(); const e = env(db);
  const mall = await createOrder(e, req(), { bookId: 'BOOK-EKODI-000001', consent: true, source: 'mall' });
  assert.equal(mall.status, 201);
  assert.equal(mall.data.successUrl, 'https://ekodi.kr/ekodimall/checkout/book/success/');
  assert.match(mall.data.failUrl, /^https:\/\/ekodi\.kr\/ekodimall\/checkout\/book\/fail\/\?orderId=/);
  assert.equal(mall.data.channel, 'mall');
  assert.equal(db.raw.prepare('SELECT source FROM books_orders WHERE id=?').get(mall.data.orderId).source, 'mall');
  const toss = async () => ({ orderId: mall.data.orderId, totalAmount: mall.data.amount, status: 'DONE', method: '카드', receipt: { url: 'https://r' } });
  assert.equal((await confirm(e, { paymentKey: 'pk', orderId: mall.data.orderId, amount: mall.data.amount }, new Date(), toss)).status, 200);
  assert.match(db.raw.prepare('SELECT note FROM books_finance_transactions').get().note, /channel=mall/);
});

test('bookstore orders keep bookstore return URLs', async () => {
  const db = d1();
  const r = await createOrder(env(db), req(), { bookId: 'BOOK-EKODI-000001', consent: true });
  assert.equal(r.data.successUrl, 'https://ekodi.kr/books/buy/success/');
  assert.equal(r.data.channel, 'bookstore');
});

test('bookstore admin sees each order channel and per-channel paid totals', async () => {
  const db = d1(); const e = env(db);
  const mk = (id, source, amount) => db.raw.prepare(`INSERT INTO books_orders (id, book_id, book_title, buyer_user_id, buyer_email, buyer_name, tier_id, list_price, amount, status, source, expires_at, created_at, updated_at) VALUES (?, 'BOOK-EKODI-000001', 't', 'u', 'a@b.c', 'n', 'member', 9900, ?, 'paid', ?, '2099', '2026-11-08', '2026-11-08')`).run(id, amount, source);
  mk('EKB-A1', 'mall', 9900); mk('EKB-A2', 'mall', 7900); mk('EKB-A3', 'bookstore', 9900);
  current = { id: 'op', email: 'op@ekodi.kr', email_confirmed_at: '2026-01-01', user_metadata: {} };
  const r = await adminRoute(e, new Request('https://ekodi.kr/books/api/commerce/admin/orders', { headers: { authorization: 'Bearer tok' } }), '/admin/orders', new URL('https://x/?limit=50'));
  assert.equal(r.status, 200);
  const mall = r.data.channels.find(c => c.id === 'mall');
  const store = r.data.channels.find(c => c.id === 'bookstore');
  assert.deepEqual([mall.label, mall.paid, mall.revenue], ['에코디몰', 2, 17800]);
  assert.deepEqual([store.label, store.paid, store.revenue], ['에코디서점', 1, 9900]);
  assert.equal(r.data.orders.find(o => o.id === 'EKB-A1').channelLabel, '에코디몰');
});
