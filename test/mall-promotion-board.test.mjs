import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { mallPromotionBoard, boardDates } from '../mall-promotion-board.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'))) db.exec(fs.readFileSync(new URL(f, MIGRATIONS), 'utf8'));
  const st = (sql, p = []) => ({ bind: (...a) => st(sql, a), async first() { return db.prepare(sql).get(...p) ?? null; }, async all() { return { results: db.prepare(sql).all(...p) }; }, async run() { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } });
  return { raw: db, prepare: sql => st(sql), async batch(l) { for (const s of l) await s.run(); } };
}

export async function seededBoard() {
  const env = { DB: d1() }; const raw = env.DB.raw; const now = '2026-10-25T05:00:00.000Z';
  raw.prepare(`INSERT INTO affiliate_storefront_products(account_id,storefront_slug,product_id,product_name,price_krw,image_url,affiliate_url,status,selected_at,last_seen_at) VALUES('coupang-ekodibiz','ekodi-mall','p1','무선 청소기 필터',11400,'https://x/i.jpg','https://link.coupang.com/a','active',?,?)`).run(now, now);
  const pid = Number(raw.prepare('SELECT id FROM affiliate_storefront_products').get().id);
  raw.prepare(`INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,display_name,token_ciphertext,token_expires_at,scopes_json,status,metadata_json,last_check_at,last_error,created_at,updated_at) VALUES('tenant','ekodimall','facebook','page','1','에코디비즈','v1.a.b','2026-12-23T00:00:00Z','[]','active','{}',?,'',?,?)`).run(now, now, now);
  const cid = Number(raw.prepare('SELECT id FROM marketing_oauth_connections').get().id);
  const runs = [['2026-10-20', 'facebook', 'published'], ['2026-10-22', 'instagram', 'published'], ['2026-10-23', 'threads', 'failed'], ['2026-10-25', 'facebook', 'published']];
  runs.forEach(([d, p, s], i) => raw.prepare(`INSERT INTO affiliate_promotion_runs(run_date,product_row_id,product_id,provider,connection_id,campaign_key,status,external_post_url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(d, pid, 'p1', p, cid, `k${i}`, s, s === 'published' ? `https://facebook.com/post/${i}` : '', s === 'published' ? now : null, now, `${d}T03:00:00Z`));
  return mallPromotionBoard(env, new Date(now));
}

test('promotion board aggregates 14-day series, schedule, channels and recent posts', async () => {
  const b = await seededBoard();
  assert.equal(b.ok, true);
  assert.equal(b.today, '2026-10-25');
  assert.equal(b.series.length, 14);
  assert.deepEqual(b.series.at(-1), { date: '2026-10-25', affiliate: 1, direct: 0, failed: 0 });
  assert.deepEqual(b.totals, { affiliate: 3, direct: 0, failed: 1 });
  assert.equal(b.schedule.length, 3);
  assert.ok(b.schedule.every(s => /^\d{2}:\d{2}$/.test(s.slotKst)));
  assert.equal(b.channels[0].name, '에코디비즈');
  assert.equal(b.recent[0].url, 'https://facebook.com/post/3');
  assert.equal(b.catalog.affiliateActive, 1);
});

test('boardDates returns 14 consecutive days ending today', () => {
  const d = boardDates('2026-10-25');
  assert.equal(d.length, 14); assert.equal(d[0], '2026-10-12'); assert.equal(d.at(-1), '2026-10-25');
});
