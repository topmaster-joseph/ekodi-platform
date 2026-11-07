import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../journal-worker.js';
import { getPublishedPosts } from '../journal-content.js';
import { bookJournalPosts, __resetJournalBooksCacheForTests } from '../journal-books.js';

const feed = { ok: true, books: [{ id: 'BOOK-EKODI-AI-A2950CFC', title: 'AI 활용 시작하기', listPrice: { label: '6,900원' } }],
  journal: [{ slug: 'book-book-ekodi-ai-a2950cfc-1', catalog_id: 'BOOK-EKODI-AI-A2950CFC', title: '『AI 활용 시작하기』 새 책 소개', summary: '첫걸음.', body: '첫 문단.\n\n둘째 문단.', theme: 'launch', published_at: '2026-11-08T00:41:00.000Z' },
    { slug: '../bad', catalog_id: 'X', title: 't', body: 'b', published_at: '2026-11-08T00:41:00.000Z' }] };
const env = (ok = true) => ({ PUBLISHING: { fetch: async () => ok ? Response.json(feed) : new Response('x', { status: 500 }) },
  ASSETS: { fetch: async () => new Response('<html><head></head><body></body></html>', { headers: { 'content-type': 'text/html' } }) } });

test('journal lists book posts from released books next to existing posts, with store link and AI disclosure', async () => {
  __resetJournalBooksCacheForTests();
  const r = await worker.fetch(new Request('https://ekodi.kr/api/posts'), env());
  const data = await r.json();
  assert.equal(data.posts.length, getPublishedPosts().length + 1, 'invalid slug dropped');
  const p = data.posts.find(x => x.slug === 'book-book-ekodi-ai-a2950cfc-1');
  assert.equal(p.categoryLabel, '출판'); assert.equal(p.author.type, 'ai-assisted-editorial');
  const one = await (await worker.fetch(new Request('https://ekodi.kr/api/posts/book-book-ekodi-ai-a2950cfc-1'), env())).json();
  assert.match(one.post.body.at(-1).text, /BOOK-EKODI-AI-A2950CFC/);
  const rss = await (await worker.fetch(new Request('https://ekodi.kr/feed.xml'), env())).text();
  assert.match(rss, /새 책 소개/);
});

test('feed outage keeps the existing journal unchanged', async () => {
  __resetJournalBooksCacheForTests();
  assert.deepEqual(await bookJournalPosts(env(false)), []);
  __resetJournalBooksCacheForTests();
  const data = await (await worker.fetch(new Request('https://ekodi.kr/api/posts'), env(false))).json();
  assert.equal(data.posts.length, getPublishedPosts().length);
});

test('ecosystem bar links the journal on publishing and bookstore pages', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['publishing/admin/index.html', 'books/index.html']) assert.match(await readFile(new URL('../' + f, import.meta.url), 'utf8'), /<a href="https:\/\/ekodi\.kr\/journal\/"><b>에코디저널<\/b><span>기록을 나누다<\/span><\/a>/);
});
