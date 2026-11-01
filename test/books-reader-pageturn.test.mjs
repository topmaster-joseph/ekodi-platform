// BOOKS-READER-002: 검토·내 서재 리더는 책장을 넘기듯 쪽 단위로 넘기고, 상단·하단 막대는 본문 폭에 맞춰 가운데 정렬한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const src = readFileSync(new URL('../books/reader/epub-reader.js', import.meta.url), 'utf8');

test('reader paginates chapters into pages and turns them with a folding leaf', () => {
  assert.match(src, /column-fill:auto/);
  assert.match(src, /@keyframes fwd/);
  assert.match(src, /@keyframes back/);
  assert.match(src, /prefers-reduced-motion:reduce/, 'motion can be turned off');
  assert.match(src, /touchstart/, 'swipe to turn on phones');
  assert.match(src, /load\(state\.i - 1, 'end'\)/, 'going back from a chapter start lands on the previous chapter\'s last page');
});

test('reader header and footer rows are centered to the book width', () => {
  assert.match(src, /\.row\{[^}]*max-width:var\(--book-w\);margin:0 auto/);
  assert.match(src, /<div class="bar"><div class="row">/);
  assert.match(src, /<div class="foot"><div class="row">/);
});

test('reader repairs escaped link schemes such as https\\:// without touching other content', () => {
  assert.match(src, /replace\(\/\^\(https\?\|mailto\)\\\\\+:\/i, '\$1:'\)/);
});

test('reader survives the /books gateway rewrite unchanged', async () => {
  const env = { BOOKS: { fetch: async () => new Response(src, { headers: { 'content-type': 'application/javascript; charset=utf-8' } }) } };
  const res = await routeCanonicalSurface(new Request('https://ekodi.kr/books/reader/epub-reader.js'), env, { legacyFetch: async () => new Response('legacy', { status: 599 }) });
  assert.equal(await res.text(), src);
});
