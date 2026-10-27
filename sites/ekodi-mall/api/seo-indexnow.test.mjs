import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { submitProductIndexNow } from './seo-indexnow.js';
import { listProductIndex } from './entry.js';

function d1(db) {
  const wrap = (sql) => { const stmt = db.prepare(sql); let args = []; const api = {
    bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return api; },
    async first() { return stmt.get(...args) ?? null; }, async run() { stmt.run(...args); return { success: true }; },
    async all() { return { results: stmt.all(...args) }; } }; return api; };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.exec('PRAGMA foreign_keys=OFF');
  const ins = db.prepare(`INSERT INTO products (id,seller_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,status,published_at,created_at,updated_at)
    VALUES (?,'u',?,'u','에코디몰','individual','direct','living',?,1000,?,?,'t',?)`);
  ins.run('p1', 'p1', '상품1', 'published', '2026-10-27T01:00:00Z', '2026-10-27T01:00:00Z');
  ins.run('p2', 'p2', '상품2', 'published', '2026-10-27T02:00:00Z', '2026-10-27T02:00:00Z');
  ins.run('p3', 'p3', '비공개', 'draft', null, '2026-10-27T03:00:00Z');
  return { db, env: { DB: d1(db), MALL_BASE_URL: 'https://ekodi.kr/ekodimall' } };
}

test('submits only published, changed product URLs once per hour and advances the cursor', async () => {
  const { db, env } = setup();
  const sent = [];
  const f = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('', { status: 202 }); };
  const r1 = await submitProductIndexNow(env, f);
  assert.equal(r1.submitted, 2);
  assert.deepEqual(sent[0].urlList, ['https://ekodi.kr/ekodimall/p/p1', 'https://ekodi.kr/ekodimall/p/p2']);
  assert.equal(sent[0].host, 'ekodi.kr');
  assert.equal((await submitProductIndexNow(env, f)).skipped, 'recent');
  const r2 = await submitProductIndexNow(env, f, { force: true });
  assert.equal(r2.submitted, 0, 'nothing changed since last cursor');
  db.prepare("UPDATE products SET updated_at='2026-10-28T00:00:00Z' WHERE id='p1'").run();
  const r3 = await submitProductIndexNow(env, f, { force: true });
  assert.equal(r3.submitted, 1);
});

test('failed submission keeps the cursor so URLs are retried', async () => {
  const { env } = setup();
  const r = await submitProductIndexNow(env, async () => new Response('', { status: 429 }));
  assert.equal(r.submitted, 0);
  const again = await submitProductIndexNow(env, async () => new Response('', { status: 200 }), { force: true });
  assert.equal(again.submitted, 2);
});

test('product index lists all published products for the sitemap', async () => {
  const { env } = setup();
  const list = await listProductIndex(env, 5000);
  assert.deepEqual(list.map((p) => p.shareCode).sort(), ['p1', 'p2']);
});
