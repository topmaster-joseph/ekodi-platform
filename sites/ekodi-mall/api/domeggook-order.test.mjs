import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { placeSupplierOrders, trackSupplierOrders, buildDeliInfo, buildItemValue, probeDomeggookLogin, chooseOptionCode } from './domeggook-order.js';

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
    if (mode === 'setLogin') return J({ domeggook: { result: 'true', sId: 'SID1', id: 'sns@952821' } });
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
  assert.equal(buildItemValue({}, { market: 'supply', qty: 2, deliMemo: '문앞|부탁' }), 'supply||P||00|2||에코디몰 위탁주문||문앞 부탁');
});

test('paid supply order is placed once, verified, then tracked to shipping', async () => {
  const { db, env } = setup();
  const log = [];
  const r = await placeSupplierOrders(env, supplier({}, log));
  assert.equal(r.placed, 1, JSON.stringify(r));
  const set = log.find((c) => c.mode === 'setOrder').params;
  assert.equal(set.get('sId'), 'SID1');
  assert.equal(set.get('id'), 'sns@952821', 'uses the member id returned by login');
  assert.equal(set.get('item[55501234]'), 'supply||P||00|2||에코디몰 위탁주문||문앞');
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

test('login probe records readiness and low e-money without secrets', async () => {
  const { db, env } = setup();
  const r = await probeDomeggookLogin(env, supplier({ emoney: 5000 }));
  assert.equal(r.ok, true);
  const row = db.prepare("SELECT result_status,metadata_json FROM supplier_connector_checks WHERE external_ref='probe:login'").get();
  assert.equal(row.result_status, 'ok');
  assert.ok(!row.metadata_json.includes('PW!') && !row.metadata_json.includes('SID1'));
  assert.ok(db.prepare("SELECT 1 FROM mall_ops_alerts WHERE kind='supply.emoney_low'").get());
  assert.equal((await probeDomeggookLogin(env, supplier())).skipped, 'recent');
});

test('option code is taken from selectOpt (in stock, no surcharge), defaulting to 00', () => {
  assert.equal(chooseOptionCode(''), '00');
  assert.equal(chooseOptionCode('{"type":"combination","data":{"00":{"name":"빨강","dom":"1","sup":"1","domPrice":"0","supPrice":"0","qty":"0"},"01":{"name":"파랑","dom":"1","sup":"1","domPrice":"0","supPrice":"0","qty":"5"},"02":{"name":"대형","dom":"1","sup":"1","supPrice":"500","qty":"9"}}}'), '01');
  assert.equal(chooseOptionCode('not json'), '00');
});


test('supplier member error is preserved as a diagnostic and stops further order attempts', async () => {
  const { db, env } = setup();
  const log = [];
  const base = supplier({}, log);
  const fetchImpl = async (url, init) => {
    const params = init?.body ? new URLSearchParams(String(init.body)) : new URL(String(url)).searchParams;
    if (params.get('mode') === 'setOrder') {
      log.push({ mode: 'setOrder', params });
      return new Response(JSON.stringify({ domeggook: { result: '회원 오류' } }));
    }
    return base(url, init);
  };
  const result = await placeSupplierOrders(env, fetchImpl);
  assert.equal(result.placed, 0);
  assert.equal(result.error, 'member-auth');
  assert.match(db.prepare('SELECT last_error FROM supplier_orders').get().last_error, /AUTH_MEMBER_ERROR: 회원 오류/);
  const probe = db.prepare("SELECT metadata_json FROM supplier_connector_checks WHERE external_ref='probe:setOrder'").get();
  assert.ok(probe);
  assert.equal(JSON.parse(probe.metadata_json).mode, 'setOrder');
  assert.ok(!probe.metadata_json.includes('SID1') && !probe.metadata_json.includes('PW!') && !probe.metadata_json.includes('AK'));
  assert.equal(log.filter((v) => v.mode === 'setOrder').length, 1);
  await placeSupplierOrders(env, fetchImpl);
  assert.equal(log.filter((v) => v.mode === 'setOrder').length, 1, 'failed auth is never blindly retried');
});

test('missing or failed e-money probe must never result in a paid order', async () => {
  for (const response of [{ domeggook: { result: 'true', data: {} } }, { domeggook: { result: '회원 오류' } }]) {
    const { db, env } = setup();
    const log = [];
    const base = supplier({}, log);
    const fetchImpl = async (url, init) => {
      const params = init?.body ? new URLSearchParams(String(init.body)) : new URL(String(url)).searchParams;
      if (params.get('mode') === 'getMyAsset') return new Response(JSON.stringify(response));
      return base(url, init);
    };
    const result = await placeSupplierOrders(env, fetchImpl);
    assert.equal(result.placed, 0);
    assert.equal(log.some((v) => v.mode === 'setOrder'), false);
    assert.match(db.prepare('SELECT last_error FROM supplier_orders').get().last_error, /EMONEY_(UNKNOWN|PROBE)/);
  }
});

test('failed login response containing a session ID is still rejected', async () => {
  const { db, env } = setup();
  const log = [];
  const base = supplier({}, log);
  const fetchImpl = async (url, init) => {
    const params = init?.body ? new URLSearchParams(String(init.body)) : new URL(String(url)).searchParams;
    if (params.get('mode') === 'setLogin') return new Response(JSON.stringify({ domeggook: { result: '회원 오류', sId: 'BAD', id: 'ekodi' } }));
    return base(url, init);
  };
  const r = await placeSupplierOrders(env, fetchImpl);
  assert.equal(r.error, 'login');
  assert.equal(log.some((v) => v.mode === 'setOrder'), false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM supplier_orders').get().n, 0);
});

test('private order calls use canonical HTTPS and prohibit automatic redirects', async () => {
  const { env } = setup();
  const log = [];
  const base = supplier({}, log);
  const urls = [];
  const fetchImpl = async (url, init) => {
    const mode = init?.body ? new URLSearchParams(String(init.body)).get('mode') : new URL(String(url)).searchParams.get('mode');
    if (mode !== 'getItemView') {
      urls.push(String(url));
      assert.equal(init?.redirect, 'error');
    }
    return base(url, init);
  };
  const r = await placeSupplierOrders(env, fetchImpl);
  assert.equal(r.placed, 1);
  assert.ok(urls.every((url) => url.startsWith('https://www.domeggook.com/ssl/api/')));
});


test('read-only login probe runs with paid auto-order OFF without issuing a setOrder request', async () => {
  const { db, env } = setup({ DOMEGGOOK_AUTO_ORDER_ENABLED: 'false', DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED: 'true' });
  const log = [];
  const r = await probeDomeggookLogin(env, supplier({}, log));
  assert.equal(r.ok, true);
  assert.equal(r.login, 'ok');
  assert.equal(r.asset, 'ok');
  assert.equal(r.loginIdMatchesConfigured, false, 'SNS login ID mismatch is diagnostic only');
  assert.deepEqual(log.map(x => x.mode), ['setLogin','getMyAsset']);
  const check = db.prepare("SELECT metadata_json FROM supplier_connector_checks WHERE external_ref='probe:login'").get().metadata_json;
  for (const secret of ['AK', 'PW!', 'SID1', 'sns@952821', '100000']) assert.ok(!check.includes(secret), 'probe metadata excludes secrets, account identifiers and balance');
  assert.equal((await probeDomeggookLogin(env, supplier({}, log))).skipped, 'recent');
});

test('read-only probe does not execute with missing credentials or without a separate opt-in', async () => {
  for (const opts of [
    { DOMEGGOOK_AUTO_ORDER_ENABLED: 'false', DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED: 'false' },
    { DOMEGGOOK_AUTO_ORDER_ENABLED: 'false', DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED: 'true', DOMEMAE_PASSWORD: '' },
  ]) {
    const { env } = setup(opts);
    const calls = [];
    const result = await probeDomeggookLogin(env, supplier({}, calls));
    assert.equal(result.skipped, 'disabled-or-no-credentials');
    assert.equal(calls.length, 0);
  }
});

test('read-only probe sanitizes a supplier member-error response and never places an order', async () => {
  const { db, env } = setup({ DOMEGGOOK_AUTO_ORDER_ENABLED: 'false', DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED: 'true' });
  const calls = [];
  const base = supplier({}, calls);
  const fetchImpl = async (url, init) => {
    const params = init?.body ? new URLSearchParams(String(init.body)) : new URL(String(url)).searchParams;
    if (params.get('mode') === 'getMyAsset') {
      calls.push({ mode: 'getMyAsset' });
      return new Response(JSON.stringify({ domeggook: { result: '회원 오류', debug: 'SID1 AK PW!' } }));
    }
    return base(url, init);
  };
  const r = await probeDomeggookLogin(env, fetchImpl);
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'MEMBER_ERROR');
  const check = db.prepare("SELECT metadata_json FROM supplier_connector_checks WHERE external_ref='probe:login'").get().metadata_json;
  assert.ok(!check.includes('SID1') && !check.includes('PW!') && !check.includes('AK'));
  assert.deepEqual(calls.map(x => x.mode), ['setLogin','getMyAsset']);
});
