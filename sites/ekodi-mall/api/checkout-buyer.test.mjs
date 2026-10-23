import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { validateBuyer, tossKeyBlockers, checkoutConfig, isWidgetClientKey } from './checkout-buyer.js';
import { createOrder } from './worker.js';
import { paymentProviderReadiness } from './payment-capabilities.js';

class Stmt { constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; } bind(...a) { this.args = a; return this; } run() { return this.db.prepare(this.sql).run(...this.args); } first() { return this.db.prepare(this.sql).get(...this.args) || null; } all() { return { results: this.db.prepare(this.sql).all(...this.args) }; } }
class DB { constructor() { this.db = new DatabaseSync(':memory:'); } prepare(sql) { return new Stmt(this.db, sql); } async batch(s) { this.db.exec('BEGIN'); try { const r = s.map(x => x.run()); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } } exec(sql) { this.db.exec(sql); } }
function migrated() {
  const db = new DB();
  const dir = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(v => v.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, dir), 'utf8'));
  const now = new Date().toISOString();
  db.db.prepare(`INSERT INTO seller_profiles (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at) VALUES ('s1','s@x','EKODIBIZ','business','google_verified','verified',?,?)`).run(now, now);
  db.db.prepare(`INSERT INTO stores (id,seller_id,slug,name,contact,status,verification_status,created_at,updated_at) VALUES ('st1','s1','ekodibiz','EKODIBIZ','c','active','verified',?,?)`).run(now, now);
  db.db.prepare(`INSERT INTO products (id,seller_id,store_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,contact,status,checkout_ready,created_at,updated_at,published_at)
    VALUES ('p1','s1','st1','SHARE1','https://ekodi.kr/ekodimall/p/SHARE1','EKODIBIZ','business','direct','general','에코디 텀블러',15000,'c','published',1,?,?,?)`).run(now, now, now);
  return db;
}
const BUYER = { name: '김구매', phone: '01012345678', email: 'buyer@example.com', postcode: '58556', address1: '전남 무안군 청계면 영산로 1', address2: '101호', memo: '문 앞', privacyConsent: true };
const LIVE_WIDGET = { PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'toss', TOSS_CLIENT_KEY: 'live_gck_x', TOSS_SECRET_KEY: 'live_gsk_y', MALL_BASE_URL: 'https://ekodi.kr/ekodimall' };

test('buyer validation requires recipient, mobile, 5-digit postcode, address and consent', () => {
  const ok = validateBuyer(BUYER);
  assert.equal(ok.ok, true);
  assert.equal(ok.buyer.phone, '010-1234-5678');
  for (const [patch, needle] of [[{ name: 'a' }, '이름'], [{ phone: '02-123-4567' }, '휴대전화'], [{ postcode: '123' }, '우편번호'], [{ address1: '' }, '주소'], [{ email: 'x' }, '이메일'], [{ privacyConsent: false }, '동의']]) {
    const r = validateBuyer({ ...BUYER, ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.ok(r.errors.some(e => e.includes(needle)), needle);
  }
  assert.equal(validateBuyer(undefined).ok, false);
});

test('Toss key pairs: widget (gck/gsk) or individual (ck/sk), never mixed or cross-mode', () => {
  assert.deepEqual(tossKeyBlockers({ TOSS_CLIENT_KEY: 'live_gck_a', TOSS_SECRET_KEY: 'live_gsk_b' }), []);
  assert.deepEqual(tossKeyBlockers({ TOSS_CLIENT_KEY: 'live_ck_a', TOSS_SECRET_KEY: 'live_sk_b' }), []);
  assert.ok(tossKeyBlockers({ TOSS_CLIENT_KEY: 'live_gck_a', TOSS_SECRET_KEY: 'live_sk_b' }).includes('toss-key-type-mismatch'));
  assert.ok(tossKeyBlockers({ TOSS_CLIENT_KEY: 'test_gck_a', TOSS_SECRET_KEY: 'live_gsk_b' }).includes('toss-key-mode-mismatch'));
  assert.ok(tossKeyBlockers({ TOSS_SECRET_KEY: 'live_gsk_b' }).includes('toss-client-key-missing'));
  assert.equal(paymentProviderReadiness(LIVE_WIDGET).liveReady, true);
  assert.equal(paymentProviderReadiness({ ...LIVE_WIDGET, TOSS_SECRET_KEY: 'live_sk_y' }).liveReady, false);
  assert.equal(isWidgetClientKey('live_gck_x'), true);
  const co = checkoutConfig(LIVE_WIDGET, { id: 'mall_1' });
  assert.deepEqual({ widget: co.widget, variantKey: co.variantKey, customerKey: co.customerKey }, { widget: true, variantKey: 'DEFAULT', customerKey: 'ANONYMOUS' });
  assert.equal(co.successUrl, 'https://ekodi.kr/ekodimall/checkout/success/');
  assert.equal(co.failUrl, 'https://ekodi.kr/ekodimall/checkout/fail/?orderId=mall_1');
  assert.ok(!JSON.stringify(co).includes('gsk'), 'secret key never reaches the browser');
});

test('direct-sale order stores the recipient and returns widget checkout config; missing buyer is refused', async () => {
  const db = migrated();
  const env = { ...LIVE_WIDGET, DB: db };
  const refused = await createOrder(env, { shareCode: 'SHARE1', quantity: 1 });
  assert.equal(refused.status, 400);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0, 'nothing stored without a recipient');
  const created = await createOrder(env, { shareCode: 'SHARE1', quantity: 2, buyer: BUYER });
  assert.equal(created.status, 201, JSON.stringify(created));
  const order = created.order;
  assert.equal(order.amount, 30000);
  assert.equal(order.checkout.clientKey, 'live_gck_x');
  assert.equal(order.checkout.widget, true);
  assert.equal(order.customerMobilePhone, '01012345678');
  assert.ok(!JSON.stringify(order).includes('live_gsk_y'));
  const row = db.db.prepare('SELECT name, phone, postcode, address1, address2 FROM order_buyers WHERE order_id=?').get(order.id);
  assert.deepEqual({ ...row }, { name: '김구매', phone: '010-1234-5678', postcode: '58556', address1: '전남 무안군 청계면 영산로 1', address2: '101호' });
  const gated = await createOrder({ ...env, PAYMENTS_ENABLED: 'false' }, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
  assert.equal(gated.status, 409, 'existing payment gates still apply');
});
