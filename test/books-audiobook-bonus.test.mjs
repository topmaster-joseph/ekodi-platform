// EBOOK buyer entitlement -> complimentary audiobook; deny by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { audiobookObjectKey, audiobookConfig, handleAudiobook } from '../books-audiobook.js';

const id = 'BOOK-EKODI-000001';
const book = { id, title: '에코디언을 찾아서', directSale: { enabled: true, fileKey: id + '/ebook.epub' },
  bonusAudio: { included: true, published: false, edition: 'ko-v1', chapterTitles: [] } };
let owned = false;
let externalOwned = false;
let calls = 0;
const catalog = () => ({ books: [book] });
const env = {
  DB: { prepare: sql => ({ bind: () => ({ first: async () => { if (sql.includes('books_audiobook_external_grants')) return externalOwned ? { '1': 1 } : null; calls++; return owned ? { '1': 1 } : null; } }) }) },
  ASSETS: { fetch: async () => new Response(JSON.stringify(catalog())) },
  BOOK_FILES: {
    head: async () => ({ size: 20 }),
    get: async () => ({ body: new Uint8Array([73, 68, 51]), size: 3 }),
  },
};
const base = 'https://ekodi.kr/api/commerce/audiobook/' + id;
const originalFetch = globalThis.fetch;
const req = (path = base, token = 'valid') => new Request(path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });

test('audio bonus uses the real ebook entitlement and never exposes unpublished bytes', async () => {
  globalThis.fetch = async url => String(url).endsWith('/auth/v1/user')
    ? new Response(JSON.stringify({ id: 'reader1', email: 'buyer@example.com', email_confirmed_at: '2026-10-28T00:00:00Z' }))
    : originalFetch(url);
  try {
    owned = false; calls = 0;
    const noLogin = await handleAudiobook(req(base, ''), env);
    assert.equal(noLogin.status, 401);
    assert.equal(calls, 0, 'no DB entitlement check without authentication');
    const denied = await handleAudiobook(req(), env);
    assert.equal(denied.status, 403);
    assert.equal(calls, 1);
    owned = true;
    let response = await handleAudiobook(req(), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'preparing');
    response = await handleAudiobook(req(base + '/track/1'), env);
    assert.equal(response.status, 409);

    book.bonusAudio.published = true;
    book.bonusAudio.chapterTitles = ['서문', '프롤로그'];
    response = await handleAudiobook(req(), env);
    assert.equal(response.status, 200);
    const listing = await response.json();
    assert.equal(listing.status, 'ready');
    assert.equal(listing.tracks.length, 2);
    const originalHead = env.BOOK_FILES.head;
    env.BOOK_FILES.head = async key => key.endsWith('chapter-002.mp3') ? null : { size: 20 };
    try {
      response = await handleAudiobook(req(base + '/track/1'), env);
      assert.equal(response.status, 409, 'one ready track cannot be downloaded while another track is missing');
    } finally { env.BOOK_FILES.head = originalHead; }
    response = await handleAudiobook(req(base + '/track/1'), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([73, 68, 51]));
    response = await handleAudiobook(req(base + '/track/300'), env);
    assert.equal(response.status, 409);
    owned = false; // refund / revoke: existing audio immediately becomes inaccessible
    response = await handleAudiobook(req(base + '/track/1'), env);
    assert.equal(response.status, 403);
    externalOwned = true;
    response = await handleAudiobook(req(base + '/track/1'), env);
    assert.equal(response.status, 200, 'verified external purchase grants audio but not ebook');
    externalOwned = false;
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('keys and track IDs cannot be arbitrarily selected', async () => {
  assert.equal(audiobookObjectKey({ id }, 'ko-v1', 1), id + '/audiobook/ko-v1/chapter-001.mp3');
  assert.equal(audiobookObjectKey({ id }, '../../etc', 1), null);
  assert.equal(audiobookObjectKey({ id }, 'ko-v1', 101), null);
  assert.equal(audiobookConfig({ bonusAudio: { included: true, edition: 'ko-v1', published: false, chapterTitles: [] } }).published, false);
  const invalid = await handleAudiobook(req(base + '/track/0'), env);
  assert.equal(invalid.status, 404);
});
