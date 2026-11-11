import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { recommendPrice, releaseText, releaseBook, publicReleases, journalTick, releaseToCatalogEntry, refreshReleaseFiles } from '../publishing-ai-release.js';
import { aiFactoryAdmin, markerCleanupTick } from '../publishing-ai-factory.js';
import { AI_NOTICE } from '../publishing-ai-epub.js';

function memory() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/202610291000_publishing_workflow.sql', import.meta.url), 'utf8'));
  const st = (sql, p = []) => ({ bind: (...v) => st(sql, v), first: async () => db.prepare(sql).get(...p) || null, all: async () => ({ results: db.prepare(sql).all(...p) }), run: async () => { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { sql: db, api: { prepare: s => st(s), batch: async qs => { db.exec('BEGIN'); try { for (const q of qs) await q.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
}
const BOOK = 'a2950cfc-e8b9-485a-ace1-c168580f3b92';
function seed(db) {
  const cols = db.sql.prepare('PRAGMA table_info(publishing_ai_books)').all();
  const row = { id: BOOK, week: 20261102, genre: 'ai-practical', title: 'AI 활용 시작하기', status: 'author_review', plan_json: JSON.stringify({ subtitle: '일상에서 바로', author: '정찬균', pitch: '오늘 바로 써먹는 AI.' }), created_at: '2026-11-04T00:00:00Z', updated_at: '2026-11-06T00:00:00Z' };
  const names = cols.filter(c => c.name in row || (c.notnull && c.dflt_value === null)).map(c => c.name);
  db.sql.prepare(`INSERT INTO publishing_ai_books (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...names.map(n => row[n] ?? ''));
  const ch = db.sql.prepare('INSERT INTO publishing_ai_chapters (book_id, number, title, summary, body, status, updated_at) VALUES (?,?,?,?,?,?,?)');
  for (let i = 1; i <= 8; i++) ch.run(BOOK, i, `${i}장`, i === 4 ? '건강 관리' : '요약', (i === 4 ? '> [확인필요] 이 장은 건강·의료 정보를 다룹니다. 확인하세요.\n\n' : '') + `본문 ${i} `.repeat(500) + ' 효과가 있습니다 [확인필요].', 'drafted', '2026-11-06');
}
const env = () => { const put = []; return { put, BOOK_FILES: { put: async (k, v, o) => put.push({ k, size: v.length, o }) } }; };
const epubFor = async (b, chapters) => ({ bytes: new TextEncoder().encode(chapters.map(c => c.body).join('\n')), digest: 'f'.repeat(64) });

test('market-based price: 9-ending, by length and genre', () => {
  assert.equal(recommendPrice({ chars: 20000 }).amount, 4900);
  assert.equal(recommendPrice({ chars: 30000, genre: 'ai-practical' }).amount, 6900);
  assert.equal(recommendPrice({ chars: 60000 }).amount, 9900);
  assert.equal(recommendPrice({ chars: 30000, genre: 'faith-devotion' }).amount, 4900);
  assert.equal(recommendPrice({ chars: 30000, genre: 'money-basics' }).amount, 8900);
  assert.match(recommendPrice({ chars: 30000 }).basis, /2026/);
});

test('release text drops review notices and markers only', () => {
  assert.equal(releaseText('> [확인필요] 이 장은 건강 정보를 다룹니다.\n\n본문입니다 [확인필요]. 성경 요 3:16 [본문확인]'), '본문입니다. 성경 요 3:16');
});

test('one final confirmation releases: approved, EPUB stored, auto price, catalog entry, first journal post; idempotent', async () => {
  const db = memory(); seed(db); const e = env();
  const book = db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK);
  const r = await releaseBook(e, db.api, book, { userId: 'owner' }, { epubFor, writeText: async () => '『AI 활용 시작하기』 새 책 소개\n일상에 AI를 들이는 첫걸음.\n\n본문 글입니다.' });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'released');
  assert.match(r.data.catalogId, /^BOOK-EKODI-AI-A2950CFC$/);
  assert.equal(e.put.length, 1); assert.equal(e.put[0].k, `${r.data.catalogId}/ebook.epub`);
  assert.equal(db.sql.prepare('SELECT status FROM publishing_ai_books WHERE id=?').get(BOOK).status, 'approved');
  assert.ok(r.data.price.amount >= 4900 && String(r.data.price.amount).endsWith('900'));
  const pub = await publicReleases(db.api);
  assert.equal(pub.books.length, 1);
  const entry = pub.books[0];
  assert.equal(entry.directSale.enabled, true); assert.equal(entry.directSale.fileKey, `${r.data.catalogId}/ebook.epub`);
  assert.equal(entry.listPrice.amount, r.data.price.amount);
  assert.deepEqual(entry.aiCollaboration.sensitive, ['건강·의료']);
  assert.equal(pub.journal.length, 1); assert.equal(pub.journal[0].title, '『AI 활용 시작하기』 새 책 소개');
  const again = await releaseBook(e, db.api, book, { userId: 'owner' }, { epubFor });
  assert.equal(again.data.already, true); assert.equal(e.put.length, 1);
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM publishing_workflow_audit WHERE action='ai_book_released'").get().n, 1);
});

test('released EPUB carries no review markers and adds a general-information page for health/finance books', async () => {
  const db = memory(); seed(db); const e = env(); let seen = null;
  const book = db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK);
  await releaseBook(e, db.api, book, { userId: 'owner' }, { epubFor: async (b, ch) => { seen = ch; return epubFor(b, ch); } });
  assert.ok(seen.every(c => !/\[확인필요\]|이 장은 건강/.test(c.body)));
  assert.equal(seen.at(-1).title, '읽기 전에 알아 두실 것');
});

test('journal: one post per released book every 7 days, at most 8; uses a template when AI is unavailable', async () => {
  const db = memory(); seed(db); const e = env();
  const book = db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK);
  await releaseBook(e, db.api, book, { userId: 'owner' }, { epubFor, writeText: async () => null });
  assert.equal((await journalTick(db.api, async () => null)).length, 0, 'not due yet');
  db.sql.prepare("UPDATE publishing_book_journal SET published_at='2026-10-01T00:00:00Z'").run();
  assert.equal((await journalTick(db.api, async () => '제목\n요약\n\n본문')).length, 1);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM publishing_book_journal').get().n, 2);
});

test('only the super admin can release in one step; incomplete books are refused', async () => {
  const db = memory(); seed(db);
  const json = (status, data) => ({ status, data });
  const editor = await aiFactoryAdmin(db.api, new Request('https://x/api/workflow/admin/ai-books/' + BOOK + '/release', { method: 'POST' }), `/api/workflow/admin/ai-books/${BOOK}/release`, { userId: 'ed' }, 'publisher', json, env());
  assert.equal(editor.status, 403); assert.equal(editor.data.code, 'SUPER_ADMIN_ONLY');
  db.sql.prepare("UPDATE publishing_ai_chapters SET status='pending' WHERE number=8").run();
  const book = db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK);
  assert.equal((await releaseBook(env(), db.api, book, { userId: 'owner' }, { epubFor })).data.code, 'CHAPTERS_INCOMPLETE');
  assert.equal((await releaseBook({}, db.api, book, { userId: 'owner' }, { epubFor })).data.code, 'BOOK_FILES_NOT_CONFIGURED');
});

test('sold file is rebuilt with the new AI notice in place; price and sale status unchanged; runs once', async () => {
  const db = memory(); seed(db); const e = env();
  const book = db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK);
  await releaseBook(e, db.api, book, { userId: 'owner' }, { epubFor });
  // 예전 판(긴 고지)으로 팔리던 상태를 재현
  db.sql.prepare("UPDATE publishing_ai_releases SET disclosure='AI 협업 초안 · 저자 감수', epub_sha256=? WHERE book_id=?").run('0'.repeat(64), BOOK);
  const before = db.sql.prepare('SELECT price_json, status, file_key FROM publishing_ai_releases WHERE book_id=?').get(BOOK);
  let seen = null; const newEpub = async (b, ch) => { seen = ch; return { bytes: new Uint8Array(1234), digest: 'a'.repeat(64) }; };
  const r = await refreshReleaseFiles(e, db.api, newEpub);
  assert.deepEqual(r, [{ catalogId: 'BOOK-EKODI-AI-A2950CFC', bytes: 1234 }]);
  assert.equal(e.put.at(-1).k, before.file_key, 'same store file address');
  const after = db.sql.prepare('SELECT price_json, status, epub_sha256, epub_bytes, disclosure, abstract FROM publishing_ai_releases WHERE book_id=?').get(BOOK);
  assert.equal(after.price_json, before.price_json); assert.equal(after.status, before.status);
  assert.equal(after.epub_sha256, 'a'.repeat(64)); assert.equal(after.epub_bytes, 1234); assert.equal(after.disclosure, AI_NOTICE);
  assert.match(after.abstract, /AI 도구를 활용해 집필·저자 감수/); assert.doesNotMatch(after.abstract, /AI 협업 초안/);
  assert.ok(seen.every(c => !/\[확인필요\]|이 장은 건강/.test(c.body)), 'sold text has no markers');
  assert.match(seen.at(-1).body, /AI 도구를 활용해 집필하고 저자가 감수/);
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM publishing_workflow_audit WHERE action='ai_release_file_refreshed'").get().n, 1);
  assert.deepEqual(await refreshReleaseFiles(e, db.api, newEpub), [], 'idempotent');
  assert.deepEqual(await refreshReleaseFiles({}, db.api, newEpub), [], 'no file store → nothing');
});

test('new releases record the new notice, so the daily refresh never loops', async () => {
  const db = memory(); seed(db); const e = env();
  await releaseBook(e, db.api, db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK), { userId: 'owner' }, { epubFor });
  assert.equal(db.sql.prepare('SELECT disclosure FROM publishing_ai_releases').get().disclosure, AI_NOTICE);
  assert.deepEqual(await refreshReleaseFiles(e, db.api, epubFor), []);
});

test('marker cleanup removes review phrases from every AI manuscript (also on sale); audited; idempotent', async () => {
  const db = memory(); seed(db);
  const SECOND = 'b1111111-2222-4333-8444-555555555555';
  const cols = db.sql.prepare('PRAGMA table_info(publishing_ai_books)').all().map(c => c.name);
  db.sql.prepare(`INSERT INTO publishing_ai_books (${cols.join(',')}) SELECT ${cols.map(c => c === 'id' ? '?' : c === 'status' ? "'approved'" : c).join(',')} FROM publishing_ai_books WHERE id=?`).run(SECOND, BOOK);
  db.sql.prepare("INSERT INTO publishing_ai_chapters (book_id, number, title, summary, body, status, updated_at) VALUES (?, 1, '1장', '', '판매본 원고 [확인필요] 기록', 'edited', 'x')").run(SECOND);
  const r = await markerCleanupTick({ PUBLISH_DB: db.api });
  assert.ok(r.some(x => x.book === BOOK.slice(0, 8)) && r.some(x => x.book === SECOND.slice(0, 8)), 'books on sale are cleaned too');
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM publishing_ai_chapters WHERE (body LIKE '%[확인필요]%' OR body LIKE '%[본문확인]%' OR body LIKE '%이 장은 건강%')").get().n, 0);
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM publishing_workflow_audit WHERE action='ai_markers_removed'").get().n, r.length);
  assert.deepEqual(await markerCleanupTick({ PUBLISH_DB: db.api }), [], 'idempotent');
});

test('opening a book in the admin cleans its markers and refreshes its sold file at once (price/status unchanged)', async () => {
  const db = memory(); seed(db); const e = env();
  const book = db.sql.prepare('SELECT * FROM publishing_ai_books WHERE id=?').get(BOOK);
  await releaseBook(e, db.api, book, { userId: 'owner' }, { epubFor });
  db.sql.prepare("UPDATE publishing_ai_releases SET disclosure='AI 협업 초안 · 저자 감수' WHERE book_id=?").run(BOOK);
  const price = db.sql.prepare('SELECT price_json, status FROM publishing_ai_releases').get();
  const json = (status, data) => ({ status, data });
  const res = await aiFactoryAdmin(db.api, new Request('https://ekodi.kr/x'), `/api/workflow/admin/ai-books/${BOOK}`, { userId: 'adminZ' }, 'admin', json, { ...e, PUBLISH_DB: db.api });
  assert.equal(res.status, 200);
  assert.ok(res.data.chapters.every(c => !/\[확인필요\]|\[본문확인\]|이 장은 건강/.test(c.body)), 'reader shows no markers right away');
  assert.equal(db.sql.prepare('SELECT disclosure FROM publishing_ai_releases').get().disclosure, AI_NOTICE);
  assert.deepEqual(db.sql.prepare('SELECT price_json, status FROM publishing_ai_releases').get(), price);
  assert.equal(e.put.length, 2, 'sold file rewritten once');
  await aiFactoryAdmin(db.api, new Request('https://ekodi.kr/x'), `/api/workflow/admin/ai-books/${BOOK}`, { userId: 'adminZ' }, 'admin', json, { ...e, PUBLISH_DB: db.api });
  assert.equal(e.put.length, 2, 'not again');
});
