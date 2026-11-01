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
  assert.match(src, /e.clientX - r.left < r.width \/ 2 \? prev : next/, 'clicking anywhere on the page turns it');
  assert.match(src, /feTurbulence/, 'paper grain texture');
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

test('running heads sit on each page: page numbers at the outer corners, book title left, chapter title right', () => {
  assert.match(src, /<div class="folio l"[^>]*><b><\/b><span><\/span><\/div><div class="folio r"/);
  assert.match(src, /\.folio\.l\{left:46px\}\.folio\.r\{right:40px;flex-direction:row-reverse\}/);
  assert.match(src, /const n = spread \? state\.p \* 2 \+ 1 : state\.p \+ 1;/);
});

// BOOKS-READER-003: 무료 오디오북을 재생하면 해당 장이 열리고, 재생 위치(글자 수 비율)에 맞춰 책장이 넘어간다.
test('reader plays the chapter track and turns pages with playback; library only offers approved audio', () => {
  assert.match(src, /pageForFraction\(audio\.currentTime \/ d\)/);
  assert.match(src, /audio\.onended = async \(\) => \{\s*while \(busy\)/, 'advances to the next chapter only after a turn finishes');
  assert.match(src, /책장 따라 넘기기/);
  assert.match(src, /URL\.revokeObjectURL\(audio\.src\)/);
  const lib = readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
  assert.match(lib, /item\.audiobook\?\.included && item\.audiobook\?\.ready && item\.audiobook\.tracks\?\.length/);
  assert.match(lib, /download\/audio\/\$\{encodeURIComponent\(item\.id\)\}/);
  const worker = readFileSync(new URL('../books-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /"media-src 'self' blob:"/);
});
