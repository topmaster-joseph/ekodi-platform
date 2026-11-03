// PUBLISHING-AI-WEEKLY-001: 무료 한도 안에서 주 1권 기획·장별 초안, 저자 감수 전에는 완료 불가.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { aiFactoryTick, aiFactoryAdmin, AI_FACTORY } from '../publishing-ai-factory.js';

function memory() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/202610291000_publishing_workflow.sql', import.meta.url), 'utf8'));
  const st = (sql, p = []) => ({ bind: (...v) => st(sql, v), first: async () => db.prepare(sql).get(...p) || null, all: async () => ({ results: db.prepare(sql).all(...p) }), run: async () => (db.prepare(sql).run(...p), {}) });
  return { sql: db, api: { prepare: s => st(s), batch: async qs => { db.exec('BEGIN'); try { for (const q of qs) await q.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
}
const plan = JSON.stringify({ title: '하루 10분 묵상', subtitle: '바쁜 날의 쉼', keywords: ['묵상'], pitch: '소개', chapters: Array.from({ length: 8 }, (_, i) => ({ title: `${i + 1}장 제목`, summary: '요지' })) });
function fakeAi(calls) { return { run: async (model, input) => { calls.push(model); const isPlan = input.messages[1].content.includes('JSON'); return { response: isPlan ? plan : '### 소제목\n' + '본문 '.repeat(200), usage: { prompt_tokens: 500, completion_tokens: isPlan ? 400 : 3000 } }; } }; }

test('disabled unless the flag, binding and DB are all present; never a paid provider', async () => {
  assert.equal((await aiFactoryTick({})).status, 'disabled');
  assert.equal(AI_FACTORY.model.startsWith('@cf/'), true);
});

test('plans this week\'s book once, drafts up to four chapters a day within the free cap, then waits', async () => {
  const db = memory(), calls = [];
  const env = { PUBLISH_DB: db.api, AI: fakeAi(calls), PUBLISHING_AI_FACTORY_ENABLED: 'true' };
  const at = new Date('2026-11-04T00:00:00Z');
  const r1 = await aiFactoryTick(env, at);
  assert.equal(r1.steps[0].status, 'planned');
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM publishing_ai_chapters WHERE status='drafted'").get().n, 4);
  const used = db.sql.prepare('SELECT neurons FROM publishing_ai_usage').get().neurons;
  assert.ok(used <= AI_FACTORY.dailyNeuronCap, 'stays within the free daily cap');
  await aiFactoryTick(env, at); // same day: budget mostly spent → waits, never plans a second book
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_ai_books').get().n, 1);
  // next days finish the book and move it to author review
  db.sql.exec('DELETE FROM publishing_ai_usage');
  await aiFactoryTick(env, at); db.sql.exec('DELETE FROM publishing_ai_usage'); await aiFactoryTick(env, at);
  assert.equal(db.sql.prepare('SELECT status FROM publishing_ai_books').get().status, 'author_review');
  assert.ok(calls.every(m => m === AI_FACTORY.model));
});

test('only publisher/admin review; unresolved [확인필요] blocks approval; edits are audited', async () => {
  const db = memory(), env = { PUBLISH_DB: db.api, AI: fakeAi([]), PUBLISHING_AI_FACTORY_ENABLED: 'true' };
  for (let i = 0; i < 3; i++) { db.sql.exec('DELETE FROM publishing_ai_usage'); await aiFactoryTick(env, new Date('2026-11-04T00:00:00Z')); }
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
