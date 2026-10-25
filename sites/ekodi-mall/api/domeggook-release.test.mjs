import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { runSupplyGate, runSupplyCuration } from './worker.js';
import { hourlyRatchet } from './domeggook-release.js';

function d1(db) {
  const wrap = (sql) => { const stmt = db.prepare(sql); let args = []; const api = {
    bind(...v) { args = v.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)); return api; },
    async first() { return stmt.get(...args) ?? null; }, async run() { stmt.run(...args); return { success: true }; },
    async all() { return { results: stmt.all(...args) }; } }; return api; };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.prepare("INSERT INTO seller_profiles (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at) VALUES ('u-1','joseph@ekodi.kr','에코디몰','individual','google_verified','verified','t','t')").run();
  for (let i = 1; i <= 3; i += 1) {
    db.prepare(`INSERT INTO products (id,seller_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,one_line,price,stock_quantity,fulfillment,contact,status,published_at,created_at,updated_at,supply_provider,supply_item_no)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published','t','t','t','domeggook',?)`).run(`prd_${i}`, 'u-1', `SC${i}`, 'u', '에코디몰', 'individual', 'direct', 'living', `상품${i}`, '소개', 9900, 10, '배송', 'joseph@ekodi.kr', `${1000 + i}`);
  }
  const env = { DB: d1(db), MALL_EKODIAN_EMAILS: 'joseph@ekodi.kr', DOMEGGOOK_AUTO_ORDER_ENABLED: 'true', DOMEMAE_API_KEY: 'K', DOMEMAE_USER_ID: 'u', DOMEMAE_PASSWORD: 'p', MALL_BASE_URL: 'https://ekodi.kr/ekodimall' };
  return { db, env };
}

test('EKODIan supply products wait (unlisted) until Domeggook purchase API approval, then go live with checkout', async () => {
  const { db, env } = setup();
  const held = await runSupplyGate(env);
  assert.equal(held.gate.approved, false);
  assert.equal(held.gate.held, 3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n, 0);
  assert.ok(db.prepare("SELECT 1 FROM mall_ops_alerts WHERE kind='supply.release_held'").get());
  db.prepare("INSERT INTO supplier_connector_checks (id,provider_id,check_type,external_ref,result_status,metadata_json,checked_at) VALUES ('c1','domemae-official','order_readiness','probe:login','ok','{}',?)").run(new Date().toISOString());
  const live = await runSupplyGate(env);
  assert.equal(live.gate.released, 3);
  const rows = db.prepare('SELECT status,checkout_ready,supply_release FROM products').all();
  assert.ok(rows.every((r) => r.status === 'published' && r.checkout_ready === 1 && r.supply_release === 'released'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mall_ops_alerts WHERE kind='supply.release_held' AND status='open'").get().n, 0);
});

test('non-supply products are never touched by the gate', async () => {
  const { db, env } = setup();
  db.prepare("UPDATE products SET supply_provider='' WHERE id='prd_1'").run();
  await runSupplyGate(env);
  assert.equal(db.prepare("SELECT status FROM products WHERE id='prd_1'").get().status, 'published');
});

test('hourly ratchet raises the selection bar and boosts keywords that sell', async () => {
  const { db, env } = setup();
  db.prepare("INSERT INTO supply_curation_keywords (keyword,scanned_at) VALUES ('차량용 수납','t'),('수면양말','t')").run();
  db.prepare("INSERT INTO supply_candidates (item_no,keyword,title,score,status,product_id,created_at,updated_at) VALUES ('1001','차량용 수납','a',1,'imported','prd_1','t','t'),('1002','수면양말','b',1,'imported','prd_2','t','t')").run();
  const cols = db.prepare('PRAGMA table_info(orders)').all().filter((c) => c.notnull && c.dflt_value === null && c.name !== 'id');
  const vals = { product_id: 'prd_1', seller_id: 'u-1', attribution_type: 'direct', status: 'paid', quantity: 1, paid_at: new Date().toISOString() };
  db.prepare(`INSERT INTO orders (id,${cols.map((c) => c.name).join(',')}) VALUES ('o1',${cols.map(() => '?').join(',')})`).run(...cols.map((c) => vals[c.name] ?? (c.type.includes('INT') ? 1 : 'x')));
  db.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id='o1'").run(new Date().toISOString());
  const r1 = await hourlyRatchet(env);
  assert.equal(r1.minScore, 0.01);
  assert.equal((await hourlyRatchet(env)).skipped, 'recent', 'once per hour');
  const r2 = await hourlyRatchet(env, { force: true });
  assert.equal(r2.minScore, 0.02);
  const w = Object.fromEntries(db.prepare('SELECT keyword,weight_adj FROM supply_curation_keywords').all().map((r) => [r.keyword, r.weight_adj]));
  assert.ok(w['차량용 수납'] > 1.09 && w['수면양말'] < 1);
});
