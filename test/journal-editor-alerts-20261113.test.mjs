import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { recordJournalInbox, maybeSendJournalDigest, journalInboxSummary, markJournalInboxSeen, __resetDigestThrottleForTests, digestText } from '../journal-editor-inbox.js';
import { handleJournalInboxControl } from '../journal-editor-inbox-control.js';
import { handleMailContactApi } from '../mail-contact.js';
import { ESSAY_POLICY } from '../publishing-journal-essays.js';

function createD1(sqlite) {
  const prepare = (query) => {
    let params = [];
    const st = {
      bind(...v) { params = v; return st; },
      async run() { const r = sqlite.prepare(query).run(...params); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      async all() { return { results: sqlite.prepare(query).all(...params) }; },
      async first() { return sqlite.prepare(query).get(...params) ?? null; },
    };
    return st;
  };
  return { prepare, async batch(list) { return Promise.all(list.map((s) => s.run())); } };
}
const kst = (iso) => Date.parse(`${iso}+09:00`);

test('digest: nothing before 18:00 KST, one mail after 18:00 with all pending letters/submissions, never twice a day', async () => {
  const env = { DB: createD1(new DatabaseSync(':memory:')) };
  await recordJournalInbox(env, { kind: 'letter', title: '[에코디저널] 정정 요청 · 글', senderName: '독자', senderEmail: 'r@example.com', message: '오타가 있어요', link: 'https://ekodi.kr/journal/p/x' });
  await recordJournalInbox(env, { kind: 'submission', title: '마을 이야기', senderName: '홍길동', senderEmail: 'h@example.com', detail: '에세이 · 원고.hwp' });
  await recordJournalInbox(env, { kind: 'essay', title: '쉼을 배우는 한 주', senderName: '에코디언' });
  const sent = [];
  const send = async (m) => { sent.push(m); };
  __resetDigestThrottleForTests();
  assert.equal((await maybeSendJournalDigest(env, { now: kst('2026-11-13T17:59:00'), send })).reason, 'before_hour');
  __resetDigestThrottleForTests();
  const r = await maybeSendJournalDigest(env, { now: kst('2026-11-13T18:01:00'), send });
  assert.equal(r.sent, true);
  assert.equal(r.count, 2, 'essays are not in the digest (their submission mail is the alert)');
  assert.match(sent[0].subject, /편지 1 · 투고 1/);
  assert.match(sent[0].body, /오타가 있어요/);
  __resetDigestThrottleForTests();
  await recordJournalInbox(env, { kind: 'letter', title: '두 번째', senderEmail: 'z@example.com', message: '늦은 편지' });
  assert.equal((await maybeSendJournalDigest(env, { now: kst('2026-11-13T21:00:00'), send })).reason, 'already_sent_today');
  assert.equal(sent.length, 1);
  __resetDigestThrottleForTests();
  assert.equal((await maybeSendJournalDigest(env, { now: kst('2026-11-14T18:10:00'), send })).count, 1, 'late letter goes in tomorrow\'s digest');
  const row = await env.DB.prepare("SELECT message FROM journal_editor_inbox WHERE title='[에코디저널] 정정 요청 · 글'").first();
  assert.equal(row.message, null, 'letter body is deleted after the digest');
});

test('digest is skipped on quiet days and retried if mail sending fails', async () => {
  const env = { DB: createD1(new DatabaseSync(':memory:')) };
  __resetDigestThrottleForTests();
  assert.equal((await maybeSendJournalDigest(env, { now: kst('2026-11-13T19:00:00'), send: async () => {} })).reason, 'nothing');
  await recordJournalInbox(env, { kind: 'letter', title: 't', senderEmail: 'a@b.c', message: 'm' });
  __resetDigestThrottleForTests();
  await assert.rejects(maybeSendJournalDigest(env, { now: kst('2026-11-13T19:00:00'), send: async () => { throw new Error('gmail down'); } }));
  __resetDigestThrottleForTests();
  assert.equal((await maybeSendJournalDigest(env, { now: kst('2026-11-13T19:30:00'), send: async () => {} })).sent, true);
});

test('admin summary counts unseen items by kind; mark seen clears the badge', async () => {
  const db = createD1(new DatabaseSync(':memory:'));
  await recordJournalInbox({ DB: db }, { kind: 'letter', title: 'a', senderEmail: 'a@b.c', message: 'm' });
  await recordJournalInbox({ DB: db }, { kind: 'essay', title: 'b' });
  const s = await journalInboxSummary(db);
  assert.equal(s.newCount, 2);
  assert.deepEqual(s.byKind, { essay: 1, letter: 1 });
  assert.equal(s.items[0].message, undefined, 'letter bodies are not exposed to the badge list');
  await markJournalInboxSeen(db);
  assert.equal((await journalInboxSummary(db)).newCount, 0);
});

test('control API is super-admin only and same-origin', async () => {
  const env = { DB: createD1(new DatabaseSync(':memory:')) };
  const req = (init = {}) => new Request('https://ekodi.kr/api/control/journal-inbox', init);
  assert.equal((await handleJournalInboxControl(req(), env, { isSuperAdmin: async () => false })).status, 403);
  assert.equal((await handleJournalInboxControl(req({ headers: { origin: 'https://evil.example' } }), env, { isSuperAdmin: async () => true })).status, 403);
  const ok = await handleJournalInboxControl(req(), env, { isSuperAdmin: async () => true });
  assert.equal((await ok.json()).newCount, 0);
  assert.equal(await handleJournalInboxControl(new Request('https://ekodi.kr/api/control/other'), env), null);
});

test('journal reader letters are queued for the evening digest instead of an immediate mail', async () => {
  const env = { ENVIRONMENT: 'test', DB: createD1(new DatabaseSync(':memory:')), MAIL_CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const original = globalThis.fetch;
  let mailed = 0;
  globalThis.fetch = async () => { mailed += 1; return new Response('{}', { status: 500 }); };
  try {
    const r = await handleMailContactApi(new Request('https://ekodi.kr/api/mail/contact', { method: 'POST', headers: { origin: 'https://ekodi.kr', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '독자', email: 'r@example.com', subject: '[에코디저널] 의견', message: '좋은 글 감사합니다', source: 'journal-reader-letter', sourceUrl: 'https://ekodi.kr/journal/' }) }), env);
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.message, /매일 저녁/);
    assert.equal(mailed, 0, 'no mail at submission time');
    assert.equal((await journalInboxSummary(env.DB)).byKind.letter, 1);
  } finally { globalThis.fetch = original; }
});

test('wiring: router runs the digest, admin shell loads the badge, essays publish 24h after the desk mail', () => {
  const router = fs.readFileSync(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  assert.match(router, /ctx\.waitUntil\(runJournalDigest\(env\)\)/);
  const shell = fs.readFileSync(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');
  assert.match(shell, /'admin-journal-inbox\.js'/);
  assert.match(fs.readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8'), /'\/admin-journal-inbox\.js'/);
  assert.match(fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'), /handleJournalInboxControl/);
  assert.equal(ESSAY_POLICY.reviewHours, 24);
  assert.match(digestText([], '2026-11-13'), /편지 0건 · 원고 투고 0건/);
});
