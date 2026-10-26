import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleOrderOpsRequest } from './order-ops.js';

function d1(db) {
  const wrap = (sql) => { const stmt = db.prepare(sql); let args = []; const api = {
    bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return api; },
    async first() { return stmt.get(...args) ?? null; }, async run() { stmt.run(...args); return { success: true }; },
    async all() { return { results: stmt.all(...args) }; } }; return api; };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=OFF');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare(`INSERT INTO products (id,seller_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,status,created_at,updated_at,supply_provider,supply_item_no)
    VALUES ('prd_1','u-1','SC1','u','에코디몰','individual','direct','living','대나무 칫솔',15000,'published','t','t','domeggook','55501234')`).run();
  const cols = db.prepare('PRAGMA table_info(orders)').all().filter((c) => c.notnull && c.dflt_value === null && c.name !== 'id');
  const vals = { attribution_type: 'direct', product_id: 'prd_1', seller_id: 'u-1', quantity: 1, gross_amount: 15000 };
  for (const id of ['ord_a', 'ord_b']) db.prepare(`INSERT INTO orders (id,${cols.map((c) => c.name).join(',')}) VALUES ('${id}',${cols.map(() => '?').join(',')})`).run(...cols.map((c) => vals[c.name] ?? (c.type.includes('INT') ? 1 : 'x')));
  db.prepare("UPDATE orders SET status='paid', paid_at='2026-10-26T01:00:00Z', created_at='2026-10-26T01:00:00Z'").run();
  db.prepare(`INSERT INTO order_buyers (order_id,name,phone,email,postcode,address1,address2,memo,privacy_consent_at,created_at) VALUES ('ord_a','김철수','010-1111-2222','a@b.kr','07328','서울 영등포구 국제금융로 30','5층','','t','t')`).run();
  db.prepare("INSERT INTO supplier_orders (id,order_id,product_id,provider,item_no,quantity,status,last_error,created_at,updated_at) VALUES ('so1','ord_a','prd_1','domeggook','55501234',1,'failed','ITEM_STOCK: 재고 0','t','t')").run();
  const env = { DB: d1(db), MALL_OPERATIONS_TOKEN: 'ops-token' };
  return { db, env };
}
const req = (path, method = 'GET', token = 'ops-token') => new Request(`https://x${path}`, { method, headers: token ? { 'x-ekodi-mall-ops-token': token } : {} });

test('operators see orders with masked buyer and supplier status; others are refused', async () => {
  const { env } = setup();
  assert.equal((await handleOrderOpsRequest(req('/api/internal/operations/orders', 'GET', ''), env)).status, 401);
  const r = await handleOrderOpsRequest(req('/api/internal/operations/orders'), env);
  assert.equal(r.status, 200);
  const a = r.body.orders.find((o) => o.id === 'ord_a');
  assert.deepEqual(a.buyer, { name: '김*수', region: '서울 영등포구' });
  assert.equal(a.supply.status, 'failed');
  assert.equal(r.body.summary.issues, 1);
  assert.equal(r.body.summary.awaitingSupply, 1);
  const issues = await handleOrderOpsRequest(req('/api/internal/operations/orders?status=supply_issue'), env);
  assert.deepEqual(issues.body.orders.map((o) => o.id), ['ord_a']);
});

test('full buyer view is audited; retry only for failed supply orders', async () => {
  const { db, env } = setup();
  const b = await handleOrderOpsRequest(req('/api/internal/operations/orders/ord_a/buyer'), env);
  assert.equal(b.body.buyer.phone, '010-1111-2222');
  assert.ok(db.prepare("SELECT 1 FROM mall_ops_audit WHERE action='order.buyer.viewed' AND request_id='ord_a'").get());
  const retry = await handleOrderOpsRequest(req('/api/internal/operations/orders/ord_a/retry-supply', 'POST'), env);
  assert.equal(retry.status, 202);
  assert.match(db.prepare("SELECT last_error FROM supplier_orders WHERE id='so1'").get().last_error, /^EMONEY_SHORT/);
  db.prepare("UPDATE supplier_orders SET status='unknown'").run();
  assert.equal((await handleOrderOpsRequest(req('/api/internal/operations/orders/ord_a/retry-supply', 'POST'), env)).status, 409);
});
