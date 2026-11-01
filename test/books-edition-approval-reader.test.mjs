// BOOKS-EDITION-APPROVAL-001 · BOOKS-READER-001
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { effectiveSaleReadiness, approvalRoute, publicApprovals } from '../books-edition-approval.js';
import { createOrder } from '../books-commerce.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
const policy = JSON.parse(fs.readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));
const ai = catalog.books.find(b => b.id === 'BOOK-EKODI-000002');

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/202611011800_books_edition_approvals.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { db.prepare(sql).run(...args); return {}; } });
  return { raw: db, prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); } };
}
const files = (etag, size = 62223) => ({ head: async () => (etag ? { httpEtag: etag, size, uploaded: new Date('2026-11-01') } : null), get: async () => null });
const req = method => new Request('https://ekodi.kr/books/api/commerce/admin/approvals/BOOK-EKODI-000002', { method });
const good = { edition: '전자책 초판 v1.0', listPrice: 9900, rightsConfirmed: true, contentReviewed: true, fileEtag: '"e1"' };

test('unapproved AI book stays blocked; checklist, edition, price and file are all required', async () => {
  const env = { DB: d1(), BOOK_FILES: files('"e1"') };
  assert.equal((await effectiveSaleReadiness(env, ai)).ready, false);
  for (const bad of [{ ...good, rightsConfirmed: false }, { ...good, contentReviewed: false }, { ...good, edition: '' }]) assert.equal((await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', bad)).status, 400);
  assert.equal((await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', { ...good, listPrice: 5000 })).data.code, 'PRICE_MISMATCH');
  assert.equal((await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', { ...good, fileEtag: '"other"' })).data.code, 'FILE_CHANGED');
  assert.equal((await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', { ...good, fileEtag: undefined })).data.code, 'FILE_CHANGED');
  assert.equal((await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', { ...good, fileEtag: '' })).data.code, 'FILE_CHANGED');
  assert.equal((await approvalRoute({ DB: env.DB, BOOK_FILES: files('"e1"', 0) }, req('POST'), ai, 'op@ekodi.kr', good)).data.code, 'FILE_MISSING');
  assert.equal((await approvalRoute({ DB: env.DB, BOOK_FILES: files(null) }, req('POST'), ai, 'op@ekodi.kr', good)).data.code, 'FILE_MISSING');
  const review = await approvalRoute(env, req('GET'), ai, 'op@ekodi.kr');
  assert.equal(review.data.catalog.title, 'AI 시대의 진보와 빈곤');
  assert.equal(review.data.catalog.author, '정찬균');
});

test('owner approval opens sale for exactly the reviewed file; a new upload or revoke closes it', async () => {
  const db = d1();
  const env = { DB: db, BOOK_FILES: files('"e1"') };
  const r = await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', good);
  assert.equal(r.status, 201);
  const ready = await effectiveSaleReadiness(env, ai);
  assert.equal(ready.ready, true); assert.equal(ready.source, 'approval'); assert.equal(ready.edition, '전자책 초판 v1.0');
  assert.deepEqual((await publicApprovals(env, catalog)).map(a => a.bookId), ['BOOK-EKODI-000002']);
  const replaced = { DB: db, BOOK_FILES: files('"e2"') };
  const after = await effectiveSaleReadiness(replaced, ai);
  assert.equal(after.ready, false); assert.ok(after.reasons.includes('APPROVAL_FILE_MISMATCH'));
  await approvalRoute(env, req('DELETE'), ai, 'op@ekodi.kr');
  assert.equal((await effectiveSaleReadiness(env, ai)).ready, false);
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM books_edition_approval_log').get().c, 2);
});

test('approved book can be ordered through the real order path', async () => {
  const user = { id: 'u1', email: 'reader@example.com', email_confirmed_at: '2026-01-01', user_metadata: {} };
  const real = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? new Response(JSON.stringify(user)) : real(url);
  try {
    const db = d1();
    const env = { DB: db, BOOK_FILES: files('"e1"'), ASSETS: { fetch: async r => new Response(JSON.stringify(new URL(r.url).pathname === '/books.json' ? catalog : policy)) }, PAYMENTS_ENABLED: 'true', TOSS_CLIENT_KEY: 'live_ck_a', TOSS_SECRET_KEY: 'live_sk_a', PUBLIC_BASE_URL: 'https://ekodi.kr/books' };
    const order = () => createOrder(env, new Request('https://x/', { method: 'POST', headers: { authorization: 'Bearer t' } }), { bookId: ai.id, consent: true });
    assert.equal((await order()).data.code, 'BOOK_NOT_SALE_READY');
    await approvalRoute(env, req('POST'), ai, 'op@ekodi.kr', good);
    const o = await order();
    assert.equal(o.status, 201); assert.equal(o.data.amount, 9900);
  } finally { globalThis.fetch = real; }
});

test('reader unzips a real EPUB with the browser DecompressionStream (no external library)', async () => {
  const src = fs.readFileSync(new URL('../books/reader/epub-reader.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /import |require\(|https?:\/\/cdn/);
  assert.match(src, /querySelectorAll\(BLOCKED\)/);
  assert.match(src, /at\.name\.startsWith\('on'\)/);
  const ctx = { window: {}, TextDecoder, DecompressionStream, Blob, Response, btoa, console };
  vm.runInNewContext(src, ctx);
  const buf = fs.readFileSync(new URL('./fixtures/reader-sample.epub', import.meta.url));
  const zip = await ctx.window.EkodiEpubReader.unzip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.match(await zip.text('META-INF/container.xml'), /OEBPS\/content\.opf/);
  assert.match(await zip.text('OEBPS/c01.xhtml'), /AI 이후, 인간은 무엇으로 남는가/);
});

test('library offers in-browser reading and operators get a review link; review page is commerce-CSP', async () => {
  const lib = fs.readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
  assert.match(fs.readFileSync(new URL('../books/review/review.js', import.meta.url), 'utf8'), /'전자책 초판 v1\.0'/);
  assert.match(fs.readFileSync(new URL('../books/review/review.js', import.meta.url), 'utf8'), /reviewBookMeta/);
  assert.match(fs.readFileSync(new URL('../books/review/index.html', import.meta.url), 'utf8'), /review-readiness/);
  assert.match(lib, /펼쳐 읽기/); assert.match(lib, /\/review\/\?book=/);
  assert.match(fs.readFileSync(new URL('../books/library/index.html', import.meta.url), 'utf8'), /\/reader\/epub-reader\.js/);
  const { isCommercePage } = await import('../books-worker.js');
  assert.equal(isCommercePage('/review/'), true);
});
