// PUBLISHING-AI-WEEKLY-001: 무료 한도 안에서 주 1권 기획·장별 초안, 저자 감수 전에는 완료 불가.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { aiFactoryTick, aiFactoryAdmin, AI_FACTORY, MODELS } from '../publishing-ai-factory.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function ledger(cap) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE ai_provider_daily_budget (provider_id TEXT NOT NULL, usage_date TEXT NOT NULL, call_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (provider_id, usage_date))');
  const st = (sql, p = []) => ({ bind: (...v) => st(sql, v), first: async () => db.prepare(sql).get(...p) || null, run: async () => { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { sql: db, api: { prepare: s => st(s) } };
}
function memory() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/202610291000_publishing_workflow.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE ai_provider_daily_budget (provider_id TEXT NOT NULL, usage_date TEXT NOT NULL, call_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (provider_id, usage_date))');
  const st = (sql, p = []) => ({ bind: (...v) => st(sql, v), first: async () => db.prepare(sql).get(...p) || null, all: async () => ({ results: db.prepare(sql).all(...p) }), run: async () => { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { sql: db, api: { prepare: s => st(s), batch: async qs => { db.exec('BEGIN'); try { for (const q of qs) await q.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
}
const plan = JSON.stringify({ title: '하루 10분 묵상', subtitle: '바쁜 날의 쉼', keywords: ['묵상'], pitch: '소개', chapters: Array.from({ length: 8 }, (_, i) => ({ title: `${i + 1}장 제목`, summary: '요지' })) });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64');
let fakeSeq = 0; // 부분마다 다른 글(반복 제거에 걸리지 않게)
function fakeAi(calls) { return { run: async (model, input) => {
  calls.push(model);
  if (model.includes('flux')) return { image: JPEG };
  const isPlan = input.messages[1].content.includes('JSON');
  const isScene = input.messages[0].content.includes('image prompts');
  return { response: isPlan ? plan : isScene ? 'A quiet window at dawn' : (() => { const k = String.fromCharCode(0xac00 + (++fakeSeq) * 37); return `### 소제목${k}\n> 핵심 문장${k}\n` + `본${k} `.repeat(430); })(), usage: { prompt_tokens: 500, completion_tokens: isPlan ? 400 : isScene ? 20 : 900 } };
} }; }

test('disabled unless the flag, binding and DB are all present; never a paid provider', async () => {
  assert.equal((await aiFactoryTick({})).status, 'disabled');
  assert.equal(AI_FACTORY.model.startsWith('@cf/'), true);
});

test('plans this week\'s book once, drafts up to four chapters a day within the free cap, then waits', async () => {
  const db = memory(), calls = [];
  const env = { PUBLISH_DB: db.api, AI: fakeAi(calls), PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: db.api };
  const at = new Date('2026-11-04T00:00:00Z');
  const r1 = await aiFactoryTick(env, at);
  assert.equal(r1.steps[0].status, 'planned');
  const firstDay = db.sql.prepare("SELECT COUNT(*) n FROM publishing_ai_chapters WHERE status='drafted'").get().n;
  assert.ok(firstDay >= 1 && firstDay <= 8, `drafts several full-length chapters on day one within the cap (got ${firstDay})`);
  const lens = db.sql.prepare("SELECT length(body) l FROM publishing_ai_chapters WHERE status='drafted'").all().map(r => r.l);
  assert.ok(lens.every(l => l >= AI_FACTORY.chapterChars * 0.9), 'chapters reach the target length by continuing in parts');
  const used = db.sql.prepare('SELECT neurons FROM publishing_ai_usage').get().neurons;
  assert.ok(used <= AI_FACTORY.dailyNeuronCap, 'stays within the free daily cap');
  await aiFactoryTick(env, at); // same day: budget mostly spent → waits, never plans a second book
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_ai_books').get().n, 1);
  // next days finish the book and move it to author review
  db.sql.exec('DELETE FROM publishing_ai_usage; DELETE FROM ai_provider_daily_budget');
  for (let d = 0; d < 20 && db.sql.prepare('SELECT status FROM publishing_ai_books').get().status === 'drafting'; d++) { await aiFactoryTick(env, at); db.sql.exec('DELETE FROM publishing_ai_usage; DELETE FROM ai_provider_daily_budget'); }
  assert.equal(db.sql.prepare('SELECT status FROM publishing_ai_books').get().status, 'author_review');
  // 무료 Workers AI 모델만: 초안·편집·삽화 세 단계
  assert.deepEqual([...new Set(calls)].sort(), [...new Set(Object.values(MODELS).map(m => m.id))].sort());
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_ai_images').get().n, 8, 'one illustration per chapter');
});

test('only publisher/admin review; unresolved [확인필요] blocks approval; edits are audited', async () => {
  const db = memory(), env = { PUBLISH_DB: db.api, AI: fakeAi([]), PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: db.api };
  for (let i = 0; i < 20; i++) { db.sql.exec('DELETE FROM publishing_ai_usage; DELETE FROM ai_provider_daily_budget'); await aiFactoryTick(env, new Date('2026-11-04T00:00:00Z')); }
  const id = db.sql.prepare('SELECT id FROM publishing_ai_books').get().id;
  const json = (status, data) => ({ status, data });
  const req = (method, body) => new Request('https://ekodi.kr/x', { method, body: body ? JSON.stringify(body) : undefined });
  const admin = { userId: 'adminZ' };
  assert.equal((await aiFactoryAdmin(db.api, req('GET'), '/api/workflow/admin/ai-books', { userId: 'a' }, 'author', json)).status, 403);
  assert.equal((await aiFactoryAdmin(db.api, req('GET'), '/api/workflow/admin/ai-books', admin, 'admin', json)).data.budget.paid, false);
  db.sql.prepare("UPDATE publishing_ai_chapters SET body = body || ' [확인필요]' WHERE number=2").run();
  const blocked = await aiFactoryAdmin(db.api, req('POST', {}), `/api/workflow/admin/ai-books/${id}/approve`, admin, 'admin', json);
  assert.equal(blocked.data.code, 'UNRESOLVED_MARKERS');
  const edited = await aiFactoryAdmin(db.api, req('PUT', { body: '고친 본문 '.repeat(60) }), `/api/workflow/admin/ai-books/${id}/chapters/2`, admin, 'admin', json);
  assert.equal(edited.status, 200);
  const ok = await aiFactoryAdmin(db.api, req('POST', {}), `/api/workflow/admin/ai-books/${id}/approve`, admin, 'admin', json);
  assert.equal(ok.data.status, 'approved');
  const actions = db.sql.prepare("SELECT action FROM publishing_workflow_audit WHERE project_id=?").all('ai:' + id).map(r => r.action);
  assert.deepEqual(actions.sort(), ['ai_book_author_reviewed', 'ai_chapter_edited']);
  assert.equal(JSON.parse(db.sql.prepare('SELECT plan_json FROM publishing_ai_books').get().plan_json).disclosure, 'AI 협업 초안 · 저자 감수');
});

test('approved book → valid EPUB 3 (mimetype first & stored, nav, colophon disclosure, images) and a no-sale handoff', async () => {
  const db = memory(), env = { PUBLISH_DB: db.api, AI: fakeAi([]), PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: db.api };
  for (let i = 0; i < 20; i++) { db.sql.exec('DELETE FROM publishing_ai_usage; DELETE FROM ai_provider_daily_budget'); await aiFactoryTick(env, new Date('2026-11-04T00:00:00Z')); }
  const id = db.sql.prepare('SELECT id FROM publishing_ai_books').get().id;
  const json = (status, data) => ({ status, data }), admin = { userId: 'adminZ' };
  const req = (method, body) => new Request('https://ekodi.kr/x', { method, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await aiFactoryAdmin(db.api, req('GET'), `/api/workflow/admin/ai-books/${id}/epub`, admin, 'admin', json)).data.code, 'AUTHOR_REVIEW_REQUIRED');
  assert.equal((await aiFactoryAdmin(db.api, req('POST', {}), `/api/workflow/admin/ai-books/${id}/approve`, admin, 'admin', json)).data.status, 'approved');
  const res = await aiFactoryAdmin(db.api, req('GET'), `/api/workflow/admin/ai-books/${id}/epub`, admin, 'admin', json);
  assert.equal(res.headers.get('content-type'), 'application/epub+zip');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), 'aiepub-')); const file = join(dir, 'b.epub'); writeFileSync(file, bytes);
  const report = JSON.parse(execFileSync('python3', ['-I', '-c', `
import zipfile, json, sys
from xml.etree import ElementTree as ET
z = zipfile.ZipFile(sys.argv[1]); first = z.infolist()[0]
names = z.namelist()
for n in names:
    if n.endswith(('.xhtml', '.opf', '.xml')): ET.fromstring(z.read(n))
print(json.dumps({'first': first.filename, 'stored': first.compress_type == 0, 'mimetype': z.read('mimetype').decode(),
  'chapters': len([n for n in names if n.startswith('OEBPS/ch')]), 'images': len([n for n in names if n.endswith('.jpg')]),
  'nav': 'OEBPS/nav.xhtml' in names, 'disclosure': 'AI 협업 초안 · 저자 감수' in z.read('OEBPS/colophon.xhtml').decode(),
  'crc': z.testzip() is None}))
`, file], { encoding: 'utf8' }));
  assert.deepEqual(report, { first: 'mimetype', stored: true, mimetype: 'application/epub+zip', chapters: 8, images: 8, nav: true, disclosure: true, crc: true });
  const pub = await aiFactoryAdmin(db.api, req('POST', {}), `/api/workflow/admin/ai-books/${id}/publish`, admin, 'admin', json);
  assert.equal(pub.data.status, 'handoff_ready');
  const out = db.sql.prepare('SELECT payload_json, status FROM publishing_workflow_handoff_outbox').get();
  assert.equal(out.status, 'pending'); assert.equal(JSON.parse(out.payload_json).saleActivation, false);
  await aiFactoryAdmin(db.api, req('POST', {}), `/api/workflow/admin/ai-books/${id}/publish`, admin, 'admin', json);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_workflow_handoff_outbox').get().n, 1, 'idempotent handoff');
});

test('deploy applies the cron trigger (guarded versions deploy alone never registers schedules)', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy-publishing.yml', import.meta.url), 'utf8');
  assert.match(wf, /triggers deploy --config wrangler\.publishing\.toml/);
  assert.match(readFileSync(new URL('../wrangler.publishing.toml', import.meta.url), 'utf8'), /crons = \["40 0 \* \* \*"/);
});

test('plan survives Workers AI returning an already-parsed JSON object, and every run is logged', async () => {
  const db = memory();
  const ai = { run: async (model, input) => model.includes('flux') ? { image: JPEG } : input.messages[1].content.includes('JSON')
    ? { response: JSON.parse(plan), usage: { prompt_tokens: 500, completion_tokens: 400 } }
    : { response: '### 소제목\n' + '본문 '.repeat(200), usage: { prompt_tokens: 500, completion_tokens: 3000 } } };
  await aiFactoryTick({ PUBLISH_DB: db.api, AI: ai, PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: db.api }, new Date('2026-11-04T00:00:00Z'));
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_ai_books').get().n, 1);
  const boom = { run: async () => { throw new Error('model unavailable'); } };
  const db2 = memory();
  await aiFactoryTick({ PUBLISH_DB: db2.api, AI: boom, PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: db.api }, new Date('2026-11-04T00:00:00Z'));
  assert.match(db2.sql.prepare('SELECT result_json FROM publishing_ai_runs').get().result_json, /model unavailable/);
});

test('all services share one Workers AI pool below the 10,000-neuron free allocation', () => {
  const ai = readFileSync(new URL('../wrangler.ai.toml', import.meta.url), 'utf8');
  const control = Number(/EKODI_WORKERS_AI_DAILY_NEURON_BUDGET\s*=\s*"(\d+)"/.exec(ai)[1]);
  assert.equal(control, AI_FACTORY.sharedPoolCap, 'AI control and publishing use the same pool cap');
  assert.ok(AI_FACTORY.sharedPoolCap <= 9500 && AI_FACTORY.dailyNeuronCap <= AI_FACTORY.sharedPoolCap);
  const pub = readFileSync(new URL('../wrangler.publishing.toml', import.meta.url), 'utf8');
  assert.match(pub, /binding = "AI_LEDGER_DB"\ndatabase_name = "ekodi-auth"/);
});

test('publishing stops when the shared pool is full, even with its own share left, and refunds failed calls', async () => {
  const db = memory(), pool = ledger();
  pool.sql.prepare("INSERT INTO ai_provider_daily_budget VALUES ('cloudflare-workers-ai:neurons', ?, 9400, 'x')").run(new Date().toISOString().slice(0, 10));
  const env = { PUBLISH_DB: db.api, AI: fakeAi([]), PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: pool.api };
  const r = await aiFactoryTick(env, new Date());
  assert.equal(r.steps[0].status, 'budget_wait');
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_ai_books').get().n, 0);
  const pool2 = ledger(), boom = { run: async () => { throw new Error('x'); } };
  await aiFactoryTick({ PUBLISH_DB: memory().api, AI: boom, PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: pool2.api }, new Date());
  assert.equal(pool2.sql.prepare('SELECT call_count c FROM ai_provider_daily_budget').get().c, 0, 'failed call reservation refunded');
});

test('author can regenerate one chapter illustration within the free budget; failure keeps the old image', async () => {
  const db = memory(), env = { PUBLISH_DB: db.api, AI: fakeAi([]), PUBLISHING_AI_FACTORY_ENABLED: 'true', AI_LEDGER_DB: db.api };
  for (let i = 0; i < 20; i++) { db.sql.exec('DELETE FROM publishing_ai_usage; DELETE FROM ai_provider_daily_budget'); await aiFactoryTick(env, new Date('2026-11-04T00:00:00Z')); }
  const id = db.sql.prepare('SELECT id FROM publishing_ai_books').get().id;
  const json = (status, data) => ({ status, data });
  const req = method => new Request('https://ekodi.kr/x', { method, body: method === 'POST' ? '{}' : undefined });
  const path = `/api/workflow/admin/ai-books/${id}/images/3`;
  db.sql.prepare("UPDATE publishing_ai_images SET data_b64='BROKEN', created_at='old' WHERE book_id=? AND number=3").run(id);
  assert.equal((await aiFactoryAdmin(db.api, req('POST'), path, { userId: 'a' }, 'author', json, env)).status, 403);
  db.sql.exec('DELETE FROM publishing_ai_usage; DELETE FROM ai_provider_daily_budget');
  const ok = await aiFactoryAdmin(db.api, req('POST'), path, { userId: 'adminZ' }, 'admin', json, env);
  assert.equal(ok.status, 200); assert.ok(ok.data.data && ok.data.data !== 'BROKEN');
  assert.equal(db.sql.prepare('SELECT data_b64 FROM publishing_ai_images WHERE book_id=? AND number=3').get(id).data_b64, ok.data.data);
  db.sql.exec(`INSERT OR REPLACE INTO publishing_ai_usage (day, neurons) VALUES ('${new Date().toISOString().slice(0, 10)}', ${AI_FACTORY.dailyNeuronCap})`);
  const spent = await aiFactoryAdmin(db.api, req('POST'), path, { userId: 'adminZ' }, 'admin', json, env);
  assert.equal(spent.status, 429);
  assert.equal(db.sql.prepare('SELECT data_b64 FROM publishing_ai_images WHERE book_id=? AND number=3').get(id).data_b64, ok.data.data, 'old image kept when budget is spent');
  assert.equal((await aiFactoryAdmin(db.api, req('POST'), `/api/workflow/admin/ai-books/${id}/images/3`, { userId: 'adminZ' }, 'admin', json, {})).status, 503);
});
