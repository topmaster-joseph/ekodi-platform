// BOOKS-REFUND-SYNC-001 — 토스에서 전액 취소가 확인된 결제만 환불로 반영하고 서재 권한을 회수한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { refundSync } from '../books-commerce.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { raw: db, prepare: sql => stmt(sql), batch: async list => { for (const s of list) await s.run(); } };
}
const ORDER = 'ekb-20261102-abcdef12';
function seed(db, status = 'paid') {
  db.raw.prepare(`INSERT INTO books_orders (id, book_id, book_title, buyer_user_id, buyer_email, list_price, amount, status, payment_key, expires_at, created_at, updated_at)
    VALUES (?, 'BOOK-EKODI-000001', '책', 'u-1', 'r@example.com', 9900, 9900, ?, 'pk_test_123456', '2099-01-01', '2026-11-02', '2026-11-02')`).run(ORDER, status);
  db.raw.prepare(`INSERT INTO books_entitlements (buyer_user_id, book_id, order_id, buyer_email, granted_at) VALUES ('u-1', 'BOOK-EKODI-000001', ?, 'r@example.com', '2026-11-02')`).run(ORDER);
}
const tossWith = payment => async () => payment;
const env = db => ({ DB: db });

test('refuses to mark refunded while Toss still shows the payment as DONE', async () => {
  const db = d1(); seed(db);
  const r = await refundSync(env(db), ORDER, 'op@ekodi.kr', new Date(), tossWith({ orderId: ORDER, totalAmount: 9900, status: 'DONE', cancels: [] }));
  assert.equal(r.status, 409); assert.equal(r.data.code, 'NOT_CANCELED');
  assert.equal(db.raw.prepare('SELECT status FROM books_orders').get().status, 'paid');
  assert.equal(db.raw.prepare('SELECT revoked_at FROM books_entitlements').get().revoked_at, null);
});

test('refuses partial cancels and mismatched payments', async () => {
  const db = d1(); seed(db);
  const partial = await refundSync(env(db), ORDER, 'op', new Date(), tossWith({ orderId: ORDER, totalAmount: 9900, status: 'PARTIAL_CANCELED', cancels: [{ cancelAmount: 5000 }] }));
  assert.equal(partial.data.code, 'NOT_CANCELED');
  const other = await refundSync(env(db), ORDER, 'op', new Date(), tossWith({ orderId: 'ekb-other-000000', totalAmount: 9900, status: 'CANCELED', cancels: [{ cancelAmount: 9900 }] }));
  assert.equal(other.data.code, 'PAYMENT_MISMATCH');
});

test('a full Toss cancel marks the order refunded, revokes the library entitlement and is idempotent', async () => {
  const db = d1(); seed(db);
  const toss = tossWith({ orderId: ORDER, totalAmount: 9900, status: 'CANCELED', cancels: [{ cancelAmount: 9900 }] });
  const r = await refundSync(env(db), ORDER, 'op@ekodi.kr', new Date('2026-11-02T00:00:00Z'), toss);
  assert.equal(r.status, 200); assert.equal(r.data.status, 'refunded');
  assert.equal(db.raw.prepare('SELECT status FROM books_orders').get().status, 'refunded');
  assert.equal(db.raw.prepare('SELECT revoked_at FROM books_entitlements').get().revoked_at, '2026-11-02T00:00:00.000Z');
  assert.ok(db.raw.prepare("SELECT 1 FROM books_commerce_audit WHERE action='order.refunded'").get());
  const again = await refundSync(env(db), ORDER, 'op', new Date(), async () => { throw new Error('should not call Toss'); });
  assert.equal(again.data.idempotent, true);
});

test('unpaid orders cannot be refunded', async () => {
  const db = d1(); seed(db, 'payment_pending');
  const r = await refundSync(env(db), ORDER, 'op', new Date(), tossWith({}));
  assert.equal(r.data.code, 'NOT_PAID');
});
