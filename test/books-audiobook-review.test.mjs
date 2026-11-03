// BOOKS-AUDIOBOOK-REVIEW-001 · BOOKS-AUDIOBOOK-PLAYER-001
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { draftTracks, reviewedAudiobook, reviewedTrackKey, audiobookReviewRoute, trackKey } from '../books-audiobook-review.js';
import { downloadAudiobook, library } from '../books-commerce.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
const book = catalog.books.find(b => b.id === 'BOOK-EKODI-000001');
const mp3 = n => { const b = new Uint8Array(400); b.set([0x49, 0x44, 0x33]); b[10] = n; return b; };

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql', import.meta.url), 'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/202611020300_books_audiobook_approvals.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { db.prepare(sql).run(...args); return {}; } });
  return { raw: db, prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); } };
}
function r2() {
  const m = new Map(); let v = 0;
  const obj = (k, e) => ({ key: k, size: e.bytes.length, httpEtag: e.etag, uploaded: new Date('2026-11-02'), customMetadata: e.meta, body: e.bytes, text: async () => new TextDecoder().decode(e.bytes) });
  return { map: m,
    put: async (k, bytes, o = {}) => { m.set(k, { bytes: new Uint8Array(bytes), etag: `"e${++v}"`, meta: o.customMetadata || {} }); },
    get: async k => (m.has(k) ? obj(k, m.get(k)) : null), head: async k => (m.has(k) ? obj(k, m.get(k)) : null),
    delete: async k => { m.delete(k); },
    list: async ({ prefix }) => ({ objects: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, e]) => obj(k, e)) }) };
}
const req = (method, body) => new Request('https://x/', { method, body, headers: body ? { 'content-type': 'audio/mpeg' } : {} });
const allChecks = { rightsApproved: true, authorApproved: true, voiceApproved: true, accessibilityReviewed: true };

test('voice-engine drafts at {book}/audiobook/NN.mp3 are listed with manifest titles; approval needs all four checks and no gaps', async () => {
  const env = { DB: d1(), BOOK_FILES: r2() };
  await env.BOOK_FILES.put(trackKey(book.id, 1), mp3(1));
  await env.BOOK_FILES.put(trackKey(book.id, 2), mp3(2));
  await env.BOOK_FILES.put(`_voice/renders/${book.id}/manifest-1.json`, new TextEncoder().encode(JSON.stringify({ tracks: [{ number: 1, title: '서문' }, { number: 2, title: '1장 잃어버린 언어' }] })));
  const t = await draftTracks(env, book);
  assert.deepEqual(t.map(x => [x.number, x.title]), [[1, '서문'], [2, '1장 잃어버린 언어']]);
  assert.equal((await reviewedAudiobook(env, book)).ready, false);
  assert.equal((await audiobookReviewRoute(env, req('POST'), book, 'op@ekodi.kr', 'approval', { ...allChecks, voiceApproved: false })).status, 400);
  await env.BOOK_FILES.put(trackKey(book.id, 4), mp3(4));
  assert.equal((await audiobookReviewRoute(env, req('POST'), book, 'op@ekodi.kr', 'approval', allChecks)).data.code, 'TRACK_GAP');
  await env.BOOK_FILES.delete(trackKey(book.id, 4));
  assert.equal((await audiobookReviewRoute(env, req('POST'), book, 'op@ekodi.kr', 'approval', { ...allChecks, etags: ['"x"', '"y"'] })).data.code, 'FILES_CHANGED');
  const ok = await audiobookReviewRoute(env, req('POST'), book, 'op@ekodi.kr', 'approval', allChecks);
  assert.equal(ok.status, 201);
  const ready = await reviewedAudiobook(env, book);
  assert.equal(ready.ready, true); assert.equal(ready.source, 'review'); assert.equal(ready.tracks.length, 2);
  assert.equal(await reviewedTrackKey(env, book, 2), trackKey(book.id, 2));
  // replacing any chapter voids the approval
  await audiobookReviewRoute(env, req('PUT', mp3(9)), book, 'op@ekodi.kr', '2', null);
  assert.equal((await reviewedAudiobook(env, book)).ready, false);
  assert.equal(await reviewedTrackKey(env, book, 1), null);
});

test('operator upload validates MP3 and size; listening endpoint streams audio', async () => {
  const env = { DB: d1(), BOOK_FILES: r2() };
  assert.equal((await audiobookReviewRoute(env, req('PUT', new Uint8Array(400)), book, 'op', '1', null)).status, 400);
  assert.equal((await audiobookReviewRoute(env, req('PUT', mp3(1)), book, 'op', '1', null)).status, 201);
  const r = await audiobookReviewRoute(env, req('GET'), book, 'op', '1/content', null);
  assert.equal(r.raw.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await audiobookReviewRoute(env, req('GET'), book, 'op', '7/content', null)).status, 404);
});

test('only an owner of the ebook gets the reviewed audiobook, and only while approval holds', async () => {
  const user = { id: 'u1', email: 'reader@example.com', email_confirmed_at: '2026-01-01', user_metadata: {} };
  const real = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/auth/v1/user') ? new Response(JSON.stringify(user)) : real(url);
  try {
    const db = d1();
    const env = { DB: db, BOOK_FILES: r2(), ASSETS: { fetch: async () => new Response(JSON.stringify(catalog)) } };
    await env.BOOK_FILES.put(trackKey(book.id, 1), mp3(1));
    await audiobookReviewRoute(env, req('POST'), book, 'op', 'approval', allChecks);
    const get = () => downloadAudiobook(env, new Request('https://x/', { headers: { authorization: 'Bearer t' } }), book.id, '1');
    assert.equal((await get()).status, 403, 'non-owner refused');
    db.raw.prepare('INSERT INTO books_entitlements (buyer_user_id, book_id, order_id, buyer_email, granted_at) VALUES (?,?,?,?,?)').run('u1', book.id, 'o', user.email, '2026-11-02');
    const ok = await get();
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'audio/mpeg');
    const lib = await library(env, new Request('https://x/', { headers: { authorization: 'Bearer t' } }));
    assert.equal(lib.data.items[0].audiobook.ready, true);
    await audiobookReviewRoute(env, req('DELETE'), book, 'op', 'approval', null);
    assert.equal((await get()).status, 409, 'revoked approval stops delivery');
  } finally { globalThis.fetch = real; }
});

test('library offers a listen button and operators get an audiobook review link; player has no external deps', () => {
  const lib = fs.readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
  assert.match(lib, /오디오북 듣기/); assert.match(lib, /\/audio-review\/\?book=/);
  assert.match(fs.readFileSync(new URL('../books/library/index.html', import.meta.url), 'utf8'), /\/reader\/audio-player\.js/);
  assert.doesNotMatch(fs.readFileSync(new URL('../books/reader/audio-player.js', import.meta.url), 'utf8'), /https?:\/\/|import /);
});
