import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { seoFor, applySeo } from '../journal-worker.js';
import { splitParagraphs, toJournalPost, __resetJournalBooksCacheForTests } from '../journal-books.js';
import { getPublishedPosts } from '../journal-content.js';

if (!globalThis.HTMLRewriter) globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };

const longBody = Array.from({ length: 12 }, (_, i) => `${i + 1}번째 장에서는 AI의 기본 개념과 활용을 차례로 소개합니다.`).join(' ');
const feed = { ok: true, books: [{ id: 'BOOK-EKODI-AI-A2950CFC', title: 'AI 활용 시작하기', author: '정찬균', listPrice: { label: '6,900원' } }],
  journal: [{ slug: 'book-book-ekodi-ai-a2950cfc-1', catalog_id: 'BOOK-EKODI-AI-A2950CFC', title: '『AI 활용 시작하기』 — 일상 속 지능형 기술 활용법', summary: '요약 <b>문장</b>.', body: longBody, published_at: '2026-11-08T00:41:00.000Z' }] };
const shellHtml = fs.readFileSync(new URL('../journal/index.html', import.meta.url), 'utf8');
const env = () => ({ PUBLISHING: { fetch: async () => Response.json(feed) },
  ASSETS: { fetch: async () => new Response(shellHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } });

test('a single wall-of-text AI manuscript is split into readable paragraphs', () => {
  const paras = splitParagraphs(longBody);
  assert.equal(paras.length, 4);
  assert.ok(paras.every((p) => p.length < 200));
  assert.deepEqual(splitParagraphs('짧은 문단.\n\n## 제목\n\n둘째.'), ['짧은 문단.', '## 제목', '둘째.']);
});

test('book posts carry a clickable bookstore call-to-action and book card data', () => {
  const post = toJournalPost(feed.journal[0], feed.books[0]);
  const cta = post.body.at(-1);
  assert.equal(cta.type, 'cta');
  assert.equal(cta.href, 'https://ekodi.kr/books/book/?id=BOOK-EKODI-AI-A2950CFC');
  assert.match(cta.text, /BOOK-EKODI-AI-A2950CFC/);
  assert.equal(post.book.title, 'AI 활용 시작하기');
  assert.equal(post.book.author, '정찬균');
});

test('article pages are server-rendered with title, OG, JSON-LD and crawlable text', async () => {
  __resetJournalBooksCacheForTests();
  const r = await worker.fetch(new Request('https://ekodi.kr/p/book-book-ekodi-ai-a2950cfc-1'), env());
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<title>『AI 활용 시작하기』 — 일상 속 지능형 기술 활용법 \| EKODI Journal<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/journal\/p\/book-book-ekodi-ai-a2950cfc-1">/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /"@type":"Book"/);
  assert.match(html, /<noscript>[\s\S]*1번째 장에서는/);
  assert.doesNotMatch(html, /<b>문장<\/b>/, 'summary is escaped');
});

test('unknown slugs answer 404 with noindex, list page carries Blog JSON-LD', async () => {
  __resetJournalBooksCacheForTests();
  const missing = await worker.fetch(new Request('https://ekodi.kr/p/does-not-exist'), env());
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /name="robots" content="noindex"/);
  const home = await (await worker.fetch(new Request('https://ekodi.kr/'), env())).text();
  assert.match(home, /"@type":"Blog"/);
  assert.match(home, /에코디 저널을 시작합니다/);
});

test('JSON-LD cannot break out of its script tag', () => {
  const post = { ...getPublishedPosts()[0], title: '</script><script>alert(1)</script>' };
  const html = applySeo(shellHtml, seoFor(post, [post]));
  assert.doesNotMatch(html, /<\/script><script>alert/);
});

test('journal client renders CTA only to EKODI https links and supports article mode', () => {
  const app = fs.readFileSync(new URL('../journal/app.js', import.meta.url), 'utf8');
  assert.match(app, /url\.protocol === 'https:' && \(url\.hostname === 'ekodi\.kr'/);
  assert.match(app, /journal-is-article/);
  assert.match(app, /article-related/);
});
