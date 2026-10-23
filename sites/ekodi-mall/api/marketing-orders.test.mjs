// Phase 8: 마케팅 수익 리포트용 내부 주문 조회 — 실제 Mall 마이그레이션 체인, 네트워크 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import entry from './entry.js';
import { MARKETING_ORDERS_PATH, handleMarketingOrdersRequest } from './marketing-orders.js';

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes } }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
}
function migrated() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(v => v.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, dir), 'utf8').replace(/^﻿/, ''));
  const now = '2026-10-20T00:00:00.000Z';
  db.prepare(`INSERT INTO seller_profiles (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at) VALUES ('s1','s@x','EKODIBIZ','business','google_verified','verified',?,?)`).run(now, now);
  db.prepare(`INSERT INTO products (id,seller_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,contact,status,created_at,updated_at,published_at)
    VALUES ('p1','s1','SHARE1','https://ekodi.kr/ekodimall/p/SHARE1','EKODIBIZ','business','direct','general','텀블러',15000,'c','published',?,?,?)`).run(now, now, now);
  const order = (id, status, paidAt) => db.prepare(`INSERT INTO orders (id,product_id,seller_id,status,quantity,unit_amount,gross_amount,attribution_type,fee_rate_percent,platform_fee_amount,seller_settlement_amount,paid_at,created_at,updated_at)
    VALUES (?,?,?,?,1,15000,15000,'marketplace',10,1500,13500,?,?,?)`).run(id, 'p1', 's1', status, paidAt, now, now);
  order('o-paid', 'paid', '2026-10-20T01:00:00.000Z');
  order('o-refunded', 'refunded', '2026-10-20T02:00:00.000Z');
  order('o-pending', 'payment_pending', null);
  order('o-old', 'paid', '2026-09-01T01:00:00.000Z');
  return { prepare: sql => new Stmt(db, sql) };
}
const req = (query, token) => new Request(`https://mall.test${MARKETING_ORDERS_PATH}${query}`, { headers: token ? { 'x-ekodi-mall-internal-token': token } : {} });

test('internal marketing orders requires the internal attribution token', async () => {
  const env = { DB: migrated(), INTERNAL_ATTRIBUTION_TOKEN: 'secret-token' };
  assert.equal((await handleMarketingOrdersRequest(req('?from=2026-10-01&to=2026-10-24'), env)).status, 401);
  assert.equal((await handleMarketingOrdersRequest(req('?from=2026-10-01&to=2026-10-24', 'wrong'), env)).status, 401);
  assert.equal((await handleMarketingOrdersRequest(req('?from=2026-10-01&to=2026-10-24', 'x'), { DB: env.DB })).status, 401, 'no token configured → closed');
});

test('internal marketing orders returns paid/refunded orders in range without buyer PII', async () => {
  const env = { DB: migrated(), INTERNAL_ATTRIBUTION_TOKEN: 'secret-token' };
  const result = await handleMarketingOrdersRequest(req('?from=2026-10-01&to=2026-10-24', 'secret-token'), env);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.orders.map(o => [o.id, o.status, o.grossAmount]), [['o-paid', 'paid', 15000], ['o-refunded', 'refunded', 15000]]);
  assert.equal(result.body.piiIncluded, false);
  const text = JSON.stringify(result.body);
  for (const forbidden of ['buyer', 'phone', 'email', 'address', 'seller_id', 's@x']) assert.ok(!text.includes(forbidden), forbidden);
  assert.equal((await handleMarketingOrdersRequest(req('?from=2026-10-24&to=2026-10-01', 'secret-token'), env)).status, 400);
  assert.equal((await handleMarketingOrdersRequest(req('?from=2025-01-01&to=2026-10-01', 'secret-token'), env)).status, 400);
});

test('entry routes the internal marketing orders endpoint before core delegation', async () => {
  const env = { DB: migrated(), INTERNAL_ATTRIBUTION_TOKEN: 'secret-token' };
  const response = await entry.fetch(req('?from=2026-10-01&to=2026-10-24', 'secret-token'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.orders.length, 2);
});
