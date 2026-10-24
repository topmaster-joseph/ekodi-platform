import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { placeSupplierOrders, trackSupplierOrders, buildDeliInfo, buildItemValue } from './domeggook-order.js';

function d1(db) {
  const wrap = (sql) => { const stmt = db.prepare(sql); let args = []; const api = {
    bind(...v) { args = v.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)); return api; },
    async first() { return stmt.get(...args) ?? null; }, async run() { stmt.run(...args); return { success: true }; },
    async all() { return { results: stmt.all(...args) }; } }; return api; };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=OFF');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare(`INSERT INTO products (id,seller_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,status,created_at,updated_at,supply_provider,supply_item_no,supply_market)
    VALUES ('prd_1','u-1','SC1','u','에코디몰','individual','direct','living','대나무 칫솔',15000,'published','t','t','domeggook','55501234','supply')`).run();
  const cols = db.prepare("PRAGMA table_info(orders)").all().filter((c) => c.notnull && c.dflt_value === null && c.name !== 'id');
  const values = { attribution_type: 'direct', product_id: 'prd_1', seller_id: 'u-1', quantity: 2, status: 'paid', gross_amount: 30000, seller_settlement_amount: 27900, paid_at: '2026-10-25T00:00:00Z' };
  const names = ['id', ...cols.map((c) => c.name)];
  const v = names.map((n) => n === 'id' ? 'ord_1' : (values[n] ?? (c => c.type.includes('INT') ? 0 : 'x')(cols.find((c) => c.name === n))));
  db.prepare(`INSERT INTO orders (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...v);
  db.prepare("UPDATE orders SET status='paid', quantity=2, seller_settlement_amount=27900, paid_at='2026-10-25T00:00:00Z' WHERE id='ord_1'").run();
  db.prepare(`INSERT INTO order_buyers (order_id,name,phone,email,postcode,address1,address2,memo,privacy_consent_at,created_at) VALUES ('ord_1','김철수','010-1111-2222','a@b.kr','07328','서울 영등포구 국제금융로6길 30','5층|A','문앞','t','t')`).run();
  const env = { DB: d1(db), DOMEMAE_API_KEY: 'AK', DOMEMAE_USER_ID: 'ekodi', DOMEMAE_PASSWORD: 'PW!', DOMEGGOOK_AUTO_ORDER_ENABLED: 'true', ...extra };
  return { db, env };
}
function supplier({ emoney = 100000, qty = 2, cost = 8000, setOrderOk = true, viewMode = 'WAITCHK', delivery = {} } = {}, log = []) {
  return async (url, init = {}) => {
    const params = init.body ? new URLSearchParams(String(init.body)) : new URL(String(url)).searchParams;
    const mode = params.get('mode'); log.push({ mode, params });
    const J = (o) => new Response(JSON.stringify(o));
    if (mode === 'setLogin') return J({ domeggook: { result: 'true', sId: 'SID1' } });
    if (mode === 'getItemView') return J({ domeggook: { basis: { no: '55501234', title: '대나무 칫솔', status: '판매중' }, price: { supply: cost }, qty: { inventory: 50 }, deli: { supply: { type: '고정', fee: 3000 } }, desc: { license: { usable: true } } } });
    if (mode === 'getMyAsset') return J({ domeggook: { result: 'true', data: { currEmoney: { total: emoney } } } });
    if (mode === 'setOrder') return J(setOrderOk ? { domeggook: { result: 'SUCCESS', order: { orderNo: 9001, itemNo: 55501234 } } } : { errors: { message: 'invalid item' } });
    if (mode === 'getOrderView') return J({ items: { itemNo: '55501234', orderQty: qty, status: '결제완료', statusMode: viewMode, delivery } });
    if (mode === 'setOrdDeny') return J({ result: 'complete' });
    return new Response('?', { status: 404 });
  };
}

test('format helpers strip pipes and follow documented order', () => {
  assert.equal(buildDeliInfo({ name: '김|철수', email: 'a@b', postcode: '07328', address1: '주소', address2: '5층', phone: '010' }), '김 철수|a@b|07328|주소|5층|010|010|');
  assert.equal(buildItemValue({}, { market: 'supply', qty: 2, deliMemo: '문앞|부탁' }), 'supply||P||01|2||에코디몰 위탁주문||문앞 부탁');
});

test('paid supply order is placed once, verified, then tracked to shipping', async () => {
  const { db, env } = setup();
  const log = [];
  const r = await placeSupplierOrders(env, supplier({}, log));
  assert.equal(r.placed, 1, JSON.stringify(r));
  const set = log.find((c) => c.mode === 'setOrder').params;
  assert.equal(set.get('sId'), 'SID1');
  assert.equal(set.get('item[55501234]'), 'supply||P||01|2||에코디몰 위탁주문||문앞');
  assert.match(set.get('deliinfo'), /^김철수\|a@b\.kr\|07328\|/);
  const row = db.prepare('SELECT status,supplier_order_no,expected_cost FROM supplier_orders').get();
  assert.deepEqual({ ...row }, { status: 'placed', supplier_order_no: '9001', expected_cost: 19000 });
  const again = await placeSupplierOrders(env, supplier({}, log));
  assert.equal(again.placed, 0, 'idempotent: never orders twice');
  assert.equal(log.filter((c) => c.mode === 'setOrder').length, 1);
  db.prepare('UPDATE supplier_orders SET checked_at=NULL').run();
  const t = await trackSupplierOrders(env, supplier({ viewMode: 'WAITOK', delivery: { code: '123456789', companyName: 'CJ대한통운' } }));
  assert.equal(t.shipped, 1);
  assert.deepEqual({ ...db.prepare('SELECT status,tracking_code,tracking_company FROM supplier_orders').get() }, { status: 'shipping', tracking_code: '123456789', tracking_company: 'CJ대한통운' });
});

test('low e-money blocks ordering with an alert and retries after top-up', async () => {
  const { db, env } = setup();
  const log = [];
  await placeSupplierOrders(env, supplier({ emoney: 1000 }, log));
  assert.equal(log.filter((c) => c.mode === 'setOrder').length, 0);
  assert.ok(db.prepare("SELECT 1 FROM mall_ops_alerts WHERE kind='supply.emoney_short'").get());
  const r = await placeSupplierOrders(env, supplier({ emoney: 50000 }, log));
  assert.equal(r.placed, 1);
});

test('negative margin and quantity mismatch never leave a wrong order standing', async () => {
  const a = setup();
  await placeSupplierOrders(a.env, supplier({ cost: 20000 }));
  assert.match(a.db.prepare('SELECT last_error FROM supplier_orders').get().last_error, /NEGATIVE_MARGIN/);
  const b = setup();
  const log = [];
  await placeSupplierOrders(b.env, supplier({ qty: 1 }, log));
  assert.ok(log.some((c) => c.mode === 'setOrdDeny'));
  assert.equal(b.db.prepare('SELECT status FROM supplier_orders').get().status, 'cancel_requested');
});

test('customer refund before shipping cancels the supplier order; disabled without credentials', async () => {
  const { db, env } = setup();
  await placeSupplierOrders(env, supplier());
  db.prepare("UPDATE orders SET status='refunded'").run();
  const log = [];
  await trackSupplierOrders(env, supplier({}, log));
  assert.ok(log.some((c) => c.mode === 'setOrdDeny'));
  assert.equal(db.prepare('SELECT status FROM supplier_orders').get().status, 'cancel_requested');
  assert.equal((await placeSupplierOrders(setup({ DOMEMAE_PASSWORD: '' }).env, supplier())).skipped, 'disabled');
});
