import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { runSupplyCuration } from './worker.js';
import { scoreListItem } from './domeggook-curation.js';

function d1(db) {
  const wrap = (sql) => { const stmt = db.prepare(sql); let args = []; const api = {
    bind(...v) { args = v.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)); return api; },
    async first() { return stmt.get(...args) ?? null; }, async run() { stmt.run(...args); return { success: true }; },
    async all() { return { results: stmt.all(...args) }; } }; return api; };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup(extra = {}) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.prepare("INSERT INTO seller_profiles (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at) VALUES ('u-1','joseph@ekodi.kr','에코디몰','individual','google_verified','verified','t','t')").run();
  const env = { DB: d1(db), MALL_BASE_URL: 'https://ekodi.kr/ekodimall', MALL_EKODIAN_EMAILS: 'joseph@ekodi.kr', DOMEMAE_API_KEY: 'K',
    DOMEGGOOK_CURATION_ENABLED: 'true', DOMEGGOOK_CURATION_TARGET: '3', MEDIA: { async put() {} }, ...extra };
  return { db, env };
}
const list = [
  { no: '1001', title: '차량용 수납 포켓', price: 4200, unitQty: 1 },
  { no: '1002', title: '차량용 USB 충전 정리함', price: 9000, unitQty: 1 },
  { no: '1003', title: '트렁크 정리함 대형', price: 12000, unitQty: 1 },
  { no: '1004', title: '차량 시트 틈새 수납', price: 800, unitQty: 1 },
  { no: '1005', title: '차량 컵홀더 수납', price: 5500, unitQty: 1 },
  { no: '1006', title: '차량 정리 바구니', price: 6500, unitQty: 1 }
];
const detail = (no, usable = true) => ({ domeggook: { basis: { no, title: `상품 ${no}`, status: '판매중' }, price: { supply: 5000 }, qty: { inventory: 80 },
  deli: { supply: { type: '고정', fee: 3000 } }, thumb: { original: 'https://cdn1.domeggook.com/a.jpg' }, desc: { license: { usable }, contents: { item: '' } } } });
function fakeFetch(calls) {
  return async (url) => { const u = new URL(String(url)); calls.push(u.searchParams.get('mode') || u.hostname);
    if (u.searchParams.get('mode') === 'getItemList') return new Response(JSON.stringify({ domeggook: { header: {}, list: { item: list } } }));
    if (u.searchParams.get('mode') === 'getItemView') { const no = u.searchParams.get('no'); return new Response(JSON.stringify(detail(no, no !== '1003'))); }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])); };
}

test('scoring rejects regulated, out-of-band and multi-quantity items; higher rank scores higher', () => {
  assert.equal(scoreListItem(list[1], 1, 6).reject, 'regulated-category');
  assert.equal(scoreListItem(list[3], 3, 6).reject, 'price-band');
  assert.equal(scoreListItem({ ...list[0], unitQty: 10 }, 0, 6).reject, 'moq');
  assert.ok(scoreListItem(list[0], 0, 6).score > scoreListItem(list[4], 4, 6).score);
});

test('curation discovers, imports with licensed photos only, publishes up to target, then stops', async () => {
  const { db, env } = setup();
  const calls = [];
  const r1 = await runSupplyCuration(env, { fetchImpl: fakeFetch(calls), perRun: 2 });
  assert.equal(r1.discovery.scanned, '차량용 수납');
  assert.equal(r1.imported, 1);
  assert.equal(r1.rejected, 1, 'second-best 1003 has no photo license');
  const pub = db.prepare("SELECT status,checkout_ready,supply_item_no FROM products ORDER BY created_at").all();
  assert.ok(pub.every((p) => p.status === 'published' && p.checkout_ready === 1));
  const r2 = await runSupplyCuration(env, { fetchImpl: fakeFetch(calls), perRun: 2 });
  // 1003 has no photo license -> rejected, next best fills the slot
  assert.equal(db.prepare("SELECT status FROM supply_candidates WHERE item_no='1003'").get().status, 'rejected');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM products WHERE status='published'").get().n, 3);
  const r3 = await runSupplyCuration(env, { fetchImpl: fakeFetch(calls), perRun: 2 });
  assert.equal(r3.done, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM supply_candidates WHERE item_no IN ('1002','1004')").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM supply_candidates WHERE item_no IN ('1002','1004') AND status='rejected'").get().n, 2);
});

test('curation is off unless enabled and needs a verified EKODIan seller', async () => {
  assert.equal((await runSupplyCuration(setup({ DOMEGGOOK_CURATION_ENABLED: 'false' }).env)).skipped, 'disabled');
  assert.equal((await runSupplyCuration(setup({ MALL_CURATION_SELLER_EMAIL: 'none@x.kr' }).env)).skipped, 'no-seller');
});
