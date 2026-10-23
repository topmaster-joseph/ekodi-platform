// EKODI-MALL-PAY-RECON-001: 웹훅·대사·재고 예약 회귀 테스트 (실제 마이그레이션 + 가짜 토스 응답, 네트워크 없음)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import core, { createOrder, buildOrderQuote, normalizeProductInput } from './worker.js';
import entry from './entry.js';
import { reconcileMallPayments, handleTossWebhook, EXPIRY_GRACE_MS } from './payment-reconciliation.js';

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes } }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  runSync() { return this.db.prepare(this.sql).run(...this.args); }
}
class DB {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(list) {
    this.db.exec('BEGIN');
    try { const r = list.map(s => s.runSync()); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
function migrated({ stock = 2 } = {}) {
  const db = new DB();
  const dir = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(v => v.endsWith('.sql')).sort()) db.db.exec(readFileSync(new URL(name, dir), 'utf8').replace(/^﻿/, ''));
  const now = new Date().toISOString();
  db.db.prepare(`INSERT INTO seller_profiles (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at) VALUES ('s1','s@x','EKODIBIZ','business','google_verified','verified',?,?)`).run(now, now);
  db.db.prepare(`INSERT INTO stores (id,seller_id,slug,name,contact,status,verification_status,created_at,updated_at) VALUES ('st1','s1','ekodibiz','EKODIBIZ','c','active','verified',?,?)`).run(now, now);
  db.db.prepare(`INSERT INTO products (id,seller_id,store_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,stock_quantity,contact,status,checkout_ready,created_at,updated_at,published_at)
    VALUES ('p1','s1','st1','SHARE1','https://ekodi.kr/ekodimall/p/SHARE1','EKODIBIZ','business','direct','general','에코디 텀블러',15000,?,'c','published',1,?,?,?)`).run(stock, now, now, now);
  return db;
}
const BUYER = { name: '김구매', phone: '01012345678', email: 'buyer@example.com', postcode: '58556', address1: '전남 무안군 청계면 영산로 1', address2: '101호', memo: '', privacyConsent: true };
const ENV = { PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'toss', EKODIPAY_PROFILE: 'mall', TOSS_CLIENT_KEY: 'live_gck_x', TOSS_SECRET_KEY: 'live_gsk_y',
  TOSS_CLIENT_KEY__MALL: 'live_gck_x', TOSS_SECRET_KEY__MALL: 'live_gsk_y', MALL_BASE_URL: 'https://ekodi.kr/ekodimall' };

// 가짜 토스: 주문별 결제 상태를 들고 있고 호출을 기록한다.
function fakeToss() {
  const payments = new Map();
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {} });
    assert.ok(u.startsWith('https://api.tosspayments.com/'), `unexpected network: ${u}`);
    const byOrder = /\/v1\/payments\/orders\/([^/?]+)$/.exec(u);
    if (byOrder) {
      const p = payments.get(decodeURIComponent(byOrder[1]));
      return p ? Response.json(p) : Response.json({ code: 'NOT_FOUND_PAYMENT', message: 'not found' }, { status: 404 });
    }
    if (u.endsWith('/v1/payments/confirm')) {
      const body = JSON.parse(init.body);
      const p = { paymentKey: body.paymentKey, orderId: body.orderId, totalAmount: body.amount, status: 'DONE', method: '카드', approvedAt: new Date().toISOString() };
      payments.set(body.orderId, p);
      return Response.json(p);
    }
    return Response.json({ code: 'UNSUPPORTED' }, { status: 500 });
  };
  return { payments, calls, restore: () => { globalThis.fetch = original; } };
}
const stockOf = db => db.db.prepare("SELECT stock_quantity AS n FROM products WHERE id='p1'").get().n;
const orderRow = (db, id) => db.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
const age = (db, id, minutes) => {
  const t = new Date(Date.now() - minutes * 60_000);
  db.db.prepare('UPDATE orders SET created_at=?, expires_at=? WHERE id=?').run(t.toISOString(), new Date(t.getTime() + 30 * 60_000).toISOString(), id);
};

test('stock: order reserves stock, oversell is refused, quote reports availability', async () => {
  const db = migrated({ stock: 2 });
  const env = { ...ENV, DB: db };
  const a = await createOrder(env, { shareCode: 'SHARE1', quantity: 2, buyer: BUYER });
  assert.equal(a.status, 201, JSON.stringify(a));
  assert.equal(stockOf(db), 0);
  assert.equal(orderRow(db, a.order.id).stock_reserved, 2);
  const q = await buildOrderQuote(env, { shareCode: 'SHARE1', quantity: 1 });
  assert.ok(q.quote.blockers.includes('out-of-stock'));
  const b = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
  assert.equal(b.status, 409);
  assert.equal(stockOf(db), 0, 'stock never goes negative');
  assert.equal(db.db.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
});

test('stock: direct-sale product without stock cannot be checked out (stock-required)', async () => {
  const db = migrated({ stock: null });
  const q = await buildOrderQuote({ ...ENV, DB: db }, { shareCode: 'SHARE1', quantity: 1 });
  assert.ok(q.quote.blockers.includes('stock-required'));
  const r = await createOrder({ ...ENV, DB: db }, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
  assert.equal(r.status, 409);
  assert.equal(db.db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('product input: stockQuantity parsed, invalid values become unmanaged, omission is detectable', () => {
  assert.equal(normalizeProductInput({ product: { stockQuantity: '7' } }).value.product.stockQuantity, 7);
  assert.equal(normalizeProductInput({ product: { stockQuantity: -1 } }).value.product.stockQuantity, null);
  assert.equal(normalizeProductInput({ product: {} }).value.product.stockProvided, false);
  assert.equal(normalizeProductInput({ product: { stockQuantity: '' } }).value.product.stockProvided, true);
});

test('confirm goes through EKODIPAY with idempotency key and clears the reservation', async () => {
  const db = migrated({ stock: 3 });
  const env = { ...ENV, DB: db };
  const toss = fakeToss();
  try {
    const o = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    const res = await core.fetch(new Request('https://ekodi.kr/api/public/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentKey: 'pk_1', orderId: o.order.id, amount: 15000 }) }), env);
    assert.equal(res.status, 200, await res.clone().text());
    const confirm = toss.calls.find(c => c.url.endsWith('/confirm'));
    assert.equal(confirm.headers['idempotency-key'], `mall-confirm-${o.order.id}`);
    assert.equal(orderRow(db, o.order.id).status, 'paid');
    assert.equal(orderRow(db, o.order.id).stock_reserved, 0);
    assert.equal(stockOf(db), 2, 'sold unit stays deducted');
  } finally { toss.restore(); }
});

test('record failure after Toss approval returns 202 and reconciliation records it', async () => {
  const db = migrated({ stock: 3 });
  const env = { ...ENV, DB: db };
  const toss = fakeToss();
  try {
    const o = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    const realBatch = db.batch.bind(db);
    db.batch = async () => { throw new Error('D1 unavailable'); };
    const res = await core.fetch(new Request('https://ekodi.kr/api/public/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentKey: 'pk_2', orderId: o.order.id, amount: 15000 }) }), env);
    assert.equal(res.status, 202);
    assert.equal((await res.json()).recordPending, true);
    assert.equal(orderRow(db, o.order.id).status, 'payment_pending', 'money taken but not yet recorded');
    db.batch = realBatch;
    age(db, o.order.id, 5);
    const summary = await reconcileMallPayments(env);
    assert.equal(summary.recorded, 1, JSON.stringify(summary));
    assert.equal(orderRow(db, o.order.id).status, 'paid');
    assert.equal(db.db.prepare("SELECT status FROM order_payments WHERE order_id=?").get(o.order.id).status, 'DONE');
    assert.equal(db.db.prepare("SELECT COUNT(*) n FROM settlement_ledger WHERE order_id=?").get(o.order.id).n, 1);
  } finally { toss.restore(); }
});

test('reconciliation leaves fresh/in-window orders alone and cancels expired unpaid ones, restoring stock', async () => {
  const db = migrated({ stock: 3 });
  const env = { ...ENV, DB: db };
  const toss = fakeToss();
  try {
    const fresh = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    const inWindow = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    const stale = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    assert.equal(stockOf(db), 0);
    age(db, inWindow.order.id, 35); // 만료됐지만 유예 안
    age(db, stale.order.id, 30 + EXPIRY_GRACE_MS / 60_000 + 1);
    const s1 = await reconcileMallPayments(env);
    assert.equal(s1.cancelled, 1, JSON.stringify(s1));
    assert.equal(orderRow(db, fresh.order.id).status, 'payment_pending');
    assert.equal(orderRow(db, inWindow.order.id).status, 'payment_pending');
    assert.equal(orderRow(db, stale.order.id).status, 'cancelled');
    assert.equal(stockOf(db), 1, 'only the stale reservation is released');
    const s2 = await reconcileMallPayments(env);
    assert.equal(stockOf(db), 1, 'rerun does not double-restore');
    assert.equal(s2.cancelled, 0);
    assert.equal(db.db.prepare("SELECT COUNT(*) n FROM commerce_events WHERE event_type='order.cancelled'").get().n, 1);
  } finally { toss.restore(); }
});

test('virtual account waiting for deposit is kept even past expiry; deposit via webhook marks paid', async () => {
  const db = migrated({ stock: 3 });
  const env = { ...ENV, DB: db };
  const toss = fakeToss();
  try {
    const o = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    age(db, o.order.id, 120);
    toss.payments.set(o.order.id, { paymentKey: 'pk_va', orderId: o.order.id, totalAmount: 15000, status: 'WAITING_FOR_DEPOSIT', method: '가상계좌' });
    await reconcileMallPayments(env);
    assert.equal(orderRow(db, o.order.id).status, 'payment_pending');
    toss.payments.set(o.order.id, { ...toss.payments.get(o.order.id), status: 'DONE', approvedAt: new Date().toISOString() });
    // 웹훅 본문의 상태는 무시하고 재조회로 확정한다(본문은 거짓 'CANCELED').
    const r = await handleTossWebhook(env, { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: o.order.id, status: 'CANCELED' } });
    assert.equal(r.body.action, 'recorded');
    assert.equal(orderRow(db, o.order.id).status, 'paid');
  } finally { toss.restore(); }
});

test('webhook: forged amount is rejected, foreign orders ignored, Toss outage asks for retry', async () => {
  const db = migrated({ stock: 5 });
  const env = { ...ENV, DB: db };
  const toss = fakeToss();
  try {
    const o = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    toss.payments.set(o.order.id, { paymentKey: 'pk_bad', orderId: o.order.id, totalAmount: 100, status: 'DONE' });
    const bad = await handleTossWebhook(env, { data: { orderId: o.order.id } });
    assert.equal(bad.body.action, 'mismatch');
    assert.equal(orderRow(db, o.order.id).status, 'payment_pending');
    const foreign = await handleTossWebhook(env, { data: { orderId: 'qtin_123' } });
    assert.equal(foreign.status, 200); assert.equal(foreign.body.ignored, 'not-a-mall-order');
    globalThis.fetch = async () => { throw new TypeError('network down'); };
    const outage = await handleTossWebhook(env, { data: { orderId: o.order.id } });
    assert.equal(outage.status, 502);
  } finally { toss.restore(); }
});

test('refund done in Toss console is reflected: order refunded, settlement reversed', async () => {
  const db = migrated({ stock: 3 });
  const env = { ...ENV, DB: db };
  const toss = fakeToss();
  try {
    const o = await createOrder(env, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    await core.fetch(new Request('https://ekodi.kr/api/public/payments/confirm', { method: 'POST', body: JSON.stringify({ paymentKey: 'pk_r', orderId: o.order.id, amount: 15000 }) }), env);
    toss.payments.set(o.order.id, { ...toss.payments.get(o.order.id), status: 'CANCELED', cancels: [{ cancelAmount: 15000 }] });
    const r = await handleTossWebhook(env, { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: o.order.id } });
    assert.equal(r.body.action, 'refunded');
    assert.equal(orderRow(db, o.order.id).status, 'refunded');
    assert.equal(db.db.prepare("SELECT status FROM settlement_ledger WHERE order_id=?").get(o.order.id).status, 'reversed');
    const again = await handleTossWebhook(env, { data: { orderId: o.order.id } });
    assert.equal(again.body.action, 'refunded');
    assert.equal(db.db.prepare("SELECT COUNT(*) n FROM commerce_events WHERE event_type='payment.refunded'").get().n, 1, 'duplicate webhook is idempotent');
  } finally { toss.restore(); }
});

test('webhook route is served without Origin and scheduled handler runs only when payments are enabled', async () => {
  const db = migrated({ stock: 1 });
  const toss = fakeToss();
  try {
    const res = await entry.fetch(new Request('https://ekodi.kr/api/public/payments/webhook', { method: 'POST', body: JSON.stringify({ data: { orderId: 'none' } }) }), { ...ENV, DB: db });
    assert.equal(res.status, 200);
    const o = await createOrder({ ...ENV, DB: db }, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
    age(db, o.order.id, 60);
    const raw = { ...ENV, TOSS_SECRET_KEY: undefined, DB: db };
    await entry.scheduled({}, { ...raw, PAYMENTS_ENABLED: 'false' }, null);
    assert.equal(orderRow(db, o.order.id).status, 'payment_pending', 'disabled → no-op');
    await entry.scheduled({}, raw, null);
    assert.equal(orderRow(db, o.order.id).status, 'cancelled');
    assert.equal(stockOf(db), 1);
  } finally { toss.restore(); }
});
