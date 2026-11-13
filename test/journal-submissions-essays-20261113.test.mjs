import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { essayTick, essayAdmin, nextTopic, parseEssay, ESSAY_TOPICS, ESSAY_POLICY, deskMessage, publishedEssays } from '../publishing-journal-essays.js';
import { toEssayPost } from '../journal-books.js';
import { handleMailContactApi, journalSubmissionText } from '../mail-contact.js';

function createD1(sqlite) {
  const prepare = (query) => {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async run() { const r = sqlite.prepare(query).run(...params); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      async all() { return { results: sqlite.prepare(query).all(...params) }; },
      async first() { return sqlite.prepare(query).get(...params) ?? null; },
    };
    return statement;
  };
  return { prepare, async batch(list) { return Promise.all(list.map((s) => s.run())); } };
}
const longBody = ['## 멈춤의 자리', '하루를 멈추고 숨을 고르는 시간이 필요합니다. '.repeat(45), '## 이번 주 실천', '일요일 오후 한 시간은 휴대폰을 내려놓아 봅시다. '.repeat(10)].join('\n');
const draft = (title = '쉼을 배우는 한 주') => `${title}\n바쁜 날들 사이에서 안식을 회복하는 작은 길을 나눕니다.\n\n${longBody}`;
const DAY = 864e5;

test('weekly essay: writes once per 7 days, submits to the desk, publishes after the 24h review window', async () => {
  const db = createD1(new DatabaseSync(':memory:'));
  const sent = [];
  const t0 = Date.parse('2026-11-14T00:40:00Z');
  const r1 = await essayTick(db, async () => draft(), { notify: async (e) => { sent.push(e); return true; }, now: t0 });
  assert.match(r1.submitted, /^ekodian-20261114-sabbath$/);
  assert.equal(sent.length, 1);
  assert.match(deskMessage(sent[0]), /24시간 뒤 자동 게재/);
  assert.deepEqual(await publishedEssays(db), [], 'not public during review');
  const r2 = await essayTick(db, async () => draft('두 번째'), { now: t0 + DAY - 2 * 3600_000 });
  assert.deepEqual(r2.published, [], 'still in review');
  assert.equal(r2.skipped, 'not_due');
  const r3 = await essayTick(db, async () => draft('두 번째'), { now: t0 + DAY + 60_000 });
  assert.deepEqual(r3.published, ['ekodian-20261114-sabbath']);
  assert.equal((await publishedEssays(db)).length, 1);
  const r4 = await essayTick(db, async () => draft('일과 AI'), { now: t0 + 7 * DAY });
  assert.match(r4.submitted, /-ai-work$/, 'next topic rotates');
});

test('unusable or missing AI drafts are not submitted (retry next day), Hanja is stripped', async () => {
  const db = createD1(new DatabaseSync(':memory:'));
  assert.equal((await essayTick(db, async () => '짧음', { now: Date.now() })).skipped, 'draft_unusable');
  assert.equal((await essayTick(db, async () => { throw new Error('no ai'); }, { now: Date.now() })).skipped, 'draft_unusable');
  const parsed = parseEssay(draft('쉼과 安息'), ESSAY_TOPICS[0]);
  assert.equal(parsed.title, '쉼과');
  assert.equal(nextTopic(16)[0], ESSAY_TOPICS[0][0]);
  assert.equal(new Set(ESSAY_TOPICS.map((t) => t[0])).size, ESSAY_TOPICS.length);
  assert.ok(new Set(ESSAY_TOPICS.map((t) => t[1])).size >= 4, 'diverse categories');
});

test('admin can hold a submitted essay so it never auto-publishes, and resume it', async () => {
  const db = createD1(new DatabaseSync(':memory:'));
  const t0 = Date.parse('2026-11-14T00:40:00Z');
  const { submitted } = await essayTick(db, async () => draft(), { now: t0 });
  const respond = (status, data) => ({ status, data });
  assert.equal((await essayAdmin(db, { method: 'POST' }, `/api/workflow/admin/journal-essays/${submitted}/hold`, 'publisher', respond)).status, 403);
  const held = await essayAdmin(db, { method: 'POST' }, `/api/workflow/admin/journal-essays/${submitted}/hold`, 'admin', respond);
  assert.equal(held.data.changed, 1);
  await essayTick(db, async () => null, { now: t0 + 3 * DAY });
  assert.deepEqual(await publishedEssays(db), [], 'held essays stay unpublished');
  const list = await essayAdmin(db, { method: 'GET' }, '/api/workflow/admin/journal-essays', 'admin', respond);
  assert.equal(list.data.essays[0].status, 'held');
  await essayAdmin(db, { method: 'POST' }, `/api/workflow/admin/journal-essays/${submitted}/publish`, 'admin', respond);
  assert.equal((await publishedEssays(db)).length, 1);
});

test('published essays become journal posts bylined 에코디언 with an AI disclosure', () => {
  const post = toEssayPost({ slug: 'ekodian-20261114-sabbath', category: 'ekodi', title: '쉼을 배우는 한 주', summary: '요약', body: longBody, published_at: '2026-11-16T00:40:00Z' });
  assert.equal(post.author.name, '에코디언');
  assert.match(post.author.disclosure, /AI 협업 초안/);
  assert.equal(post.categoryLabel, 'EKODI 생각');
  assert.equal(post.body.find((b) => b.type === 'heading').text, '멈춤의 자리');
  const factory = fs.readFileSync(new URL('../publishing-ai-factory.js', import.meta.url), 'utf8');
  assert.match(factory, /essayTick\(env\.PUBLISH_DB/);
  assert.equal(ESSAY_POLICY.everyDays, 7);
});

function submissionRequest(fields, file, { origin = 'https://ekodi.kr' } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('manuscript', file);
  return new Request('https://ekodi.kr/api/mail/journal-submission', { method: 'POST', headers: { origin }, body: form });
}
const env = { ENVIRONMENT: 'test' };
const ok = { name: '홍길동', email: 'reader@example.com', title: '마을에서 배운 것', category: '에세이' };

test('journal submission: validates required fields, origin, file type and size before any mail is sent', async () => {
  const docx = new File([new Uint8Array([80, 75, 3, 4])], '원고.docx');
  assert.equal((await handleMailContactApi(submissionRequest(ok, docx, { origin: 'https://evil.example' }), env)).status, 403);
  assert.equal((await handleMailContactApi(submissionRequest({ ...ok, name: '' }, docx), env)).status, 400);
  assert.equal((await handleMailContactApi(submissionRequest({ ...ok, email: 'bad' }, docx), env)).status, 400);
  assert.equal((await handleMailContactApi(submissionRequest(ok, null), env)).status, 400);
  const exe = await handleMailContactApi(submissionRequest(ok, new File([new Uint8Array(10)], 'virus.exe')), env);
  assert.equal(exe.status, 415);
  const big = await handleMailContactApi(submissionRequest(ok, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.pdf')), env);
  assert.equal(big.status, 413);
  const trap = await handleMailContactApi(submissionRequest({ ...ok, website: 'spam' }, docx), env);
  assert.equal((await trap.json()).ok, true, 'honeypot silently accepted, nothing sent');
  assert.match(journalSubmissionText({ name: '홍길동', email: 'a@b.c', title: 't', category: '에세이', message: '', fileName: '원고.docx', fileBytes: 2048, sourceUrl: '', receivedAt: 'now' }), /첨부 원고: 원고\.docx \(2KB\)/);
});

test('gmail adapter builds a multipart message with a base64 attachment and encoded Korean headers', async () => {
  const { sendGoogleMailMessage } = await import('../mail-google-adapter.js');
  let raw = '';
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { raw = JSON.parse(init.body).raw; return new Response('{"id":"m1"}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    await sendGoogleMailMessage('token', { to: 'joseph@ekodi.kr', subject: '[에코디저널 투고] 제목', body: '본문', attachments: [{ filename: '원고.pdf', contentType: 'application/pdf', base64: btoa('PDF') }] });
  } finally { globalThis.fetch = original; }
  const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.match(decoded, /Content-Type: multipart\/mixed; boundary="ekodi_/);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
  assert.match(decoded, /Content-Disposition: attachment; filename="=\?UTF-8\?B\?/);
  assert.match(decoded, new RegExp(btoa('PDF')));
});

test('journal has a 투고 안내 page with the manuscript form and it is in the sitemap', async () => {
  const html = fs.readFileSync(new URL('../journal/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\/journal\/submit"/);
  for (const field of ['name="name"', 'name="email"', 'name="title"', 'name="manuscript"', 'type="file"']) assert.ok(html.includes(field), field);
  const app = fs.readFileSync(new URL('../journal/app.js', import.meta.url), 'utf8');
  assert.match(app, /fetch\('\/api\/mail\/journal-submission'/);
  if (!globalThis.HTMLRewriter) globalThis.HTMLRewriter = class { on() { return this; } transform(r) { return r; } };
  const { default: worker } = await import('../journal-worker.js');
  const wenv = { ASSETS: { fetch: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } };
  const page = await worker.fetch(new Request('https://ekodi.kr/submit'), wenv);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>투고 안내 \| EKODI Journal<\/title>/);
  assert.match(await (await worker.fetch(new Request('https://ekodi.kr/sitemap.xml'), wenv)).text(), /journal\/submit/);
});
