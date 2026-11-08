import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { issueOf, issueLabel, docNumber, postType, citation } from '../journal/issue.js';
import worker from '../journal-worker.js';
import { getPublishedPosts } from '../journal-content.js';
import { journalPostItems } from '../public-discovery-content.js';
import { collectIndexCandidates } from '../marketing-indexnow-scheduler.js';
import { __resetJournalBooksCacheForTests } from '../journal-books.js';

if (!globalThis.HTMLRewriter) globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };
const shellHtml = fs.readFileSync(new URL('../journal/index.html', import.meta.url), 'utf8');
const env = { ASSETS: { fetch: async () => new Response(shellHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } };

test('issue numbering starts at 제1권 제1호 in September 2026 (KST) and rolls volumes every 12 issues', () => {
  assert.deepEqual({ ...issueOf('2026-09-01T00:00:00+09:00') }, { serial: 1, volume: 1, number: 1, year: 2026, month: 9 });
  assert.equal(issueLabel('2026-11-08T12:00:00+09:00'), '제1권 제3호 · 2026년 11월');
  assert.equal(issueOf('2027-09-01T00:00:00+09:00').volume, 2);
  assert.equal(issueOf('2027-09-01T00:00:00+09:00').number, 1);
  assert.equal(issueOf('2026-08-28T15:00:00+09:00').serial, 1, 'pre-launch drafts belong to the founding issue');
  assert.equal(issueOf('2026-08-31T16:00:00Z').month, 9, 'month boundary is computed in KST');
});

test('document numbers are stable per month in publication order', () => {
  const posts = getPublishedPosts();
  const sep = posts.filter((p) => p.publishedAt.startsWith('2026-09')).sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  assert.equal(docNumber(sep[0], posts), 'EKJ-2026-09-001');
  assert.equal(docNumber(sep.at(-1), posts), `EKJ-2026-09-${String(sep.length).padStart(3, '0')}`);
  assert.equal(postType('build'), '구축 기록');
  assert.match(citation(sep[0], posts), /EKODI Journal, 제1권 제1호, EKJ-2026-09-001\. https:\/\/ekodi\.kr\/journal\/p\//);
});

test('JSON Feed and article JSON-LD expose issue, document number and breadcrumbs', async () => {
  __resetJournalBooksCacheForTests();
  const feed = await (await worker.fetch(new Request('https://ekodi.kr/feed.json'), env)).json();
  assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(feed.items.length, getPublishedPosts().length);
  assert.match(feed.items[0]._ekodi.doc, /^EKJ-\d{4}-\d{2}-\d{3}$/);
  const post = getPublishedPosts()[0];
  const html = await (await worker.fetch(new Request(`https://ekodi.kr/p/${post.slug}`), env)).text();
  assert.match(html, /"@type":"PublicationIssue"/);
  assert.match(html, /"identifier":"EKJ-/);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test('journal posts join the public registry, promotion board and IndexNow candidates', async () => {
  const journalEnv = { JOURNAL: { fetch: (req) => worker.fetch(new Request(req.url.replace('https://journal.internal', 'https://ekodi.kr')), env) } };
  const items = await journalPostItems(journalEnv);
  assert.equal(items.length, getPublishedPosts().length);
  assert.ok(items.every((i) => i.type === 'article' && i.siteId === 'journal' && i.url.startsWith('https://ekodi.kr/journal/p/')));
  assert.deepEqual(await journalPostItems({}), [], 'no binding → no items, no throw');
  const { candidates, errors } = await collectIndexCandidates(journalEnv, { registry: async () => ({ resources: [] }), fetch: async () => new Response('[]', { status: 503 }) });
  assert.ok(candidates.some((c) => c.url === 'https://ekodi.kr/journal/'));
  assert.equal(candidates.filter((c) => c.source === 'journal').length, getPublishedPosts().length + 1);
  assert.ok(!errors.some((e) => e.startsWith('journal')));
  assert.match(fs.readFileSync(new URL('../promotion.js', import.meta.url), 'utf8'), /journal: '에코디저널'/);
});

test('reader channels name the editorial desk contact and avoid external font loading', () => {
  const html = shellHtml;
  assert.match(html, /mailto:joseph@ekodi\.kr/);
  assert.match(html, /편집부 담당 정찬균 · joseph@ekodi\.kr/);
  assert.match(html, /href="\/journal\/feed\.json"/);
  const css = fs.readFileSync(new URL('../journal/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css + html, /fonts\.googleapis|@import/);
});

test('stray service paths under /journal redirect to the real service instead of 404', async () => {
  const r = await worker.fetch(new Request('https://ekodi.kr/community/'), env);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://ekodi.kr/community/');
  const b = await worker.fetch(new Request('https://ekodi.kr/books/book/?id=X'), env);
  assert.equal(b.headers.get('location'), 'https://ekodi.kr/books/book/?id=X');
  for (const own of ['/', '/api/posts', '/feed.json', '/health']) {
    assert.notEqual((await worker.fetch(new Request(`https://ekodi.kr${own}`), env)).status, 301, own);
  }
  assert.doesNotMatch(shellHtml, /href="\/community\/"/);
});
