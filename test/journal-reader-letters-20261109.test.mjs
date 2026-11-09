import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLATFORM_EXECUTION_SURFACES } from '../platform-route-registry.js';
import { dedupeBookParagraphs, toJournalPost } from '../journal-books.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ROOT_LITERAL = /(["'`])\/(?!\/)([^"'`\r\n]*)\1/g; // canonical-surface-router prefixRootLiterals

test('community API paths are not root literals the router would prefix with /community (404 → error toast)', () => {
  const app = read('community/app.js');
  const hits = [...app.matchAll(ROOT_LITERAL)].map((m) => m[0]).filter((h) => /profile|circles|people/.test(h));
  assert.deepEqual(hits, []);
  assert.match(app, /api\('profile'\)/);
  assert.match(app, /function apiPath\(path\)/);
});

test('journal is base-path aware, so its absolute links (https://ekodi.kr/community/) are never rewritten to /journal/…', () => {
  const routes = PLATFORM_EXECUTION_SURFACES;
  const journal = (Array.isArray(routes) ? routes : Object.values(routes)).find((r) => r?.id === 'journal');
  assert.ok(journal, 'journal route');
  assert.equal(journal.basePathAware, true);
});

test('book posts drop store/AI-disclosure sentences (shown in CTA and editorial note) and a lead that repeats the deck', () => {
  const summary = '이 책은 일상에서 AI를 활용하는 방법과 사례를 介绍하는 책입니다';
  const body = '이 책은 일상에서 AI를 활용하는 방법과 사례를 介绍하는 책입니다. 여러 장으로 되어 있습니다.\n\n본문 설명입니다. 『AI 활용 시작하기』는 에코디서점에서 판매 중입니다. 이 책은 AI 협업 초안 · 저자 감수 도서';
  const post = toJournalPost({ slug:'book-x-1', catalog_id:'BOOK-X', title:'『AI 활용 시작하기』', summary, body, published_at:'2026-11-08T00:00:00Z' }, { id:'BOOK-X', title:'AI 활용 시작하기', listPrice:{ label:'6,900원' } });
  const text = post.body.map((b) => b.text || '').join(' ');
  assert.doesNotMatch(text.replace(post.body.at(-1).text, ''), /판매 중|AI 협업 초안/);
  assert.equal(post.body.at(-1).type, 'cta');
  assert.doesNotMatch(post.excerpt + text, /介绍/);
  assert.match(post.excerpt, /소개/);
  assert.deepEqual(dedupeBookParagraphs(['단독 문단.'], ''), ['단독 문단.']);
});

test('reader letters go through the web form to the shared contact mail API, with mailto only as a fallback', () => {
  const app = read('journal/app.js');
  assert.match(app, /fetch\('\/api\/mail\/contact'/);
  assert.match(app, /source: 'journal-reader-letter'/);
  assert.match(app, /name="website"/, 'honeypot field');
  assert.match(app, /data-letter-toggle/);
  const html = read('journal/index.html');
  assert.doesNotMatch(html, /href="mailto:[^"]*subject=/, 'primary letter action is no longer a mail-app link');
  assert.match(html, /id="journal-letter-box"/);
  const contact = read('mail-contact.js');
  assert.match(contact, /'\/api\/mail\/contact'/);
});

test('front page has labelled sections and no duplicated type/category kicker', () => {
  const app = read('journal/app.js');
  assert.match(app, /front-section-label/);
  assert.match(app, /const sameWord =/);
});
