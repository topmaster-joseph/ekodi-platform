// BOOKS-DIRECT-COMMERCE-001 — server pricing, fail-closed gating, confirm + entitlement + finance ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { priceFor, createOrder, confirm, quote, isValidOrderId, newOrderId, directSaleBook } from '../books-commerce.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { raw: db, prepare: sql => stmt(sql), batch: async list => { db.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
const assets = { fetch: async req => new Response(JSON.stringify(new URL(req.url).pathname === '/books.json' ? catalog : policy), { status: 200 }) };
const baseEnv = db => ({ DB: db, ASSETS: assets, PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_abc', TOSS_SECRET_KEY: 'live_sk_abc', OPERATOR_EMAILS: 'op@ekodi.kr', PUBLIC_BASE_URL: 'https://ekodi.kr/books' });
const user = { id: 'u-1', email: 'reader@example.com', email_confirmed_at: '2026-01-01', user_metadata: { name: '독자' } };
const signedIn = () => new Request('https://ekodi.kr/books/api/commerce/orders', { method: 'POST', headers: { authorization: 'Bearer tok' } });
const realFetch = globalThis.fetch;
test.beforeEach(() => { globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? new Response(JSON.stringify(user)) : realFetch(url); });
test.afterEach(() => { globalThis.fetch = realFetch; });

test('tier pricing is computed on the server and rounded to 100 won', () => {
  const book = directSaleBook(catalog, 'BOOK-EKODI-000001');
  assert.equal(priceFor(book, policy, 'member').amount, 9900);
  assert.equal(priceFor(book, policy, 'ekodian').amount, 7900);
  assert.equal(priceFor(book, policy, 'subscriber').amount, 6900);
  assert.equal(priceFor(book, policy, 'unknown').amount, 9900);
});

test('order ids are Toss-safe and validated', () => {
  const id = newOrderId(new Date('2026-10-27T00:00:00Z'));
  assert.ok(isValidOrderId(id)); assert.ok(id.length <= 64);
  assert.ok(!isValidOrderId('EKB-../../x'));
});

test('payments closed → no order is accepted (fail closed)', async () => {
  const db = d1();
  const r = await createOrder({ ...baseEnv(db), PAYMENTS_ENABLED: 'false' }, signedIn(), { bookId: 'BOOK-EKODI-000001', consent: true });
  assert.equal(r.status, 503);
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM books_orders').get().c, 0);
});

test('test keys allow only operators to buy', async () => {
  const db = d1();
  const env = { ...baseEnv(db), TOSS_CLIENT_KEY: 'test_ck_a', TOSS_SECRET_KEY: 'test_sk_a' };
  assert.equal((await createOrder(env, signedIn(), { bookId: 'BOOK-EKODI-000001', consent: true })).data.code, 'PAYMENTS_TEST_ONLY');
});

test('client-sent amounts are ignored; tier price is charged; confirm grants library + ledger', async () => {
  const db = d1();
  const env = baseEnv(db);
  db.raw.prepare("INSERT INTO books_member_tiers (buyer_email, tier_id, updated_at) VALUES ('reader@example.com','ekodian','2026-10-27')").run();
  const created = await createOrder(env, signedIn(), { bookId: 'BOOK-EKODI-000001', consent: true, amount: 100 });
  assert.equal(created.status, 201);
  assert.equal(created.data.amount, 7900);
  const calls = [];
  const toss = async (_env, _profile, path, opts) => { calls.push(path); return { orderId: created.data.orderId, totalAmount: 7900, status: 'DONE', method: '카드', receipt: { url: 'https://r' } }; };
  assert.equal((await confirm(env, { paymentKey: 'pk', orderId: created.data.orderId, amount: 100 }, new Date(), toss)).status, 409, 'amount tampering is rejected');
  const ok = await confirm(env, { paymentKey: 'pk', orderId: created.data.orderId, amount: 7900 }, new Date(), toss);
  assert.equal(ok.status, 200);
  assert.equal(db.raw.prepare("SELECT status FROM books_orders").get().status, 'paid');
  assert.equal(db.raw.prepare("SELECT COUNT(*) c FROM books_entitlements WHERE book_id='BOOK-EKODI-000001'").get().c, 1);
  const ledger = db.raw.prepare("SELECT channel_code, transaction_type, amount_krw FROM books_finance_transactions").get();
  assert.deepEqual({ ...ledger }, { channel_code: 'ekodi-direct', transaction_type: 'sale', amount_krw: 7900 });
  const again = await confirm(env, { paymentKey: 'pk', orderId: created.data.orderId, amount: 7900 }, new Date(), toss);
  assert.equal(again.data.idempotent, true);
  assert.equal(calls.length, 1, 'idempotent confirm does not call Toss twice');
  assert.equal((await createOrder(env, signedIn(), { bookId: 'BOOK-EKODI-000001', consent: true })).data.code, 'ALREADY_OWNED');
});

test('Toss mismatch never grants the book', async () => {
  const db = d1();
  const env = baseEnv(db);
  const created = await createOrder(env, signedIn(), { bookId: 'BOOK-EKODI-000002', consent: true });
  const toss = async () => ({ orderId: created.data.orderId, totalAmount: 1, status: 'DONE' });
  const r = await confirm(env, { paymentKey: 'pk', orderId: created.data.orderId, amount: created.data.amount }, new Date(), toss);
  assert.equal(r.status, 409);
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM books_entitlements').get().c, 0);
});

test('quote shows every tier price and a closed checkout when payments are off', async () => {
  const db = d1();
  const r = await quote({ ...baseEnv(db), PAYMENTS_ENABLED: 'false' }, new Request('https://x/'), 'BOOK-EKODI-000001');
  assert.equal(r.status, 200);
  assert.equal(r.data.checkout.open, false);
  assert.deepEqual(r.data.tiers.map(t => t.price), [9900, 7900, 6900]);
});

test('only operators can grant member tiers, and the tier changes the price', async () => {
  const { adminRoute } = await import('../books-commerce.js');
  const db = d1();
  const env = baseEnv(db);
  const req = (method, body) => new Request('https://x/api/commerce/admin/tiers', { method, headers: { authorization: 'Bearer t' }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await adminRoute(env, req('POST', { email: 'a@b.kr', tierId: 'ekodian' }), '/admin/tiers', new URL('https://x/'))).status, 403);
  globalThis.fetch = async () => new Response(JSON.stringify({ ...user, email: 'op@ekodi.kr' }));
  assert.equal((await adminRoute(env, req('POST', { email: 'reader@example.com', tierId: 'subscriber' }), '/admin/tiers', new URL('https://x/'))).status, 200);
  assert.equal((await adminRoute(env, req('POST', { email: 'reader@example.com', tierId: 'gold' }), '/admin/tiers', new URL('https://x/'))).status, 400);
  globalThis.fetch = async () => new Response(JSON.stringify(user));
  const created = await createOrder(env, signedIn(), { bookId: 'BOOK-EKODI-000001', consent: true });
  assert.equal(created.data.amount, 6900);
});
