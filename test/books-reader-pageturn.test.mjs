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

test('book leaf ratio, page gap and visible page advances use the same measurements', () => {
  assert.match(src, /const ratio = spread \? 1\.46 : 0\.73/);
  assert.match(src, /--book-h/);
  assert.match(src, /const pageStep = \(\) => view\.clientWidth \+ pageGap/);
  assert.match(src, /inner\.style\.columnGap =/);
  assert.match(src, /inner\.style\.columnWidth =/);
  assert.match(src, /max-width:var\(--column-w,100%\)!important/);
  assert.match(src, /sheet\.spread::before/);
  assert.doesNotMatch(src, /view\.clientWidth \+ 80/);
});

test('library exposes owned EPUB through reader only, not an EPUB-save button', () => {
  const lib = readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
  // 구매자 영역(운영자 패널 밖)에는 EPUB 저장이 없다. 운영자 패널만 판매 파일을 내려받는다(서버도 운영자에게만 내줌).
  const op = lib.indexOf('async function operatorPanel()');
  assert.ok(op > 0);
  const buyerPart = lib.slice(0, op), operatorPart = lib.slice(op);
  assert.doesNotMatch(buyerPart, /EPUB 받기|EPUB 내려받기|\.epub`/);
  assert.doesNotMatch(lib, /EPUB 받기/);
  assert.match(operatorPart, /admin\/files\/\$\{encodeURIComponent\(book\.id\)\}\/content/, 'operator download uses the operator-only file route');
  assert.match(lib, /펼쳐 읽기/);
  assert.match(lib, /downloadAudio/);
});


test('Toss merchant review: purchase and policy delivery copy match the EPUB reader', () => {
  const purchase = readFileSync(new URL('../books/buy/index.html', import.meta.url), 'utf8');
  const checkout = readFileSync(new URL('../books/buy/buy.js', import.meta.url), 'utf8');
  const commerce = JSON.parse(readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));
  assert.match(purchase, /EPUB 전자책을 온라인 리더로 열람/);
  assert.match(checkout, /전자책 리더에서 열람/);
  assert.match(commerce.policy.delivery, /온라인 리더로 열람/);
  assert.doesNotMatch(purchase, /EPUB 파일을 바로 받습니다/);
  assert.doesNotMatch(commerce.policy.delivery, /EPUB 파일을 받습니다/);
});

test('Toss merchant review: Books consent and checkout use the existing EKODIBIZ refund policy without altering refund processing', () => {
  const checkoutHtml = readFileSync(new URL('../books/buy/index.html', import.meta.url), 'utf8');
  const commerce = JSON.parse(readFileSync(new URL('../books/commerce.json', import.meta.url), 'utf8'));
  const canonicalPolicy = readFileSync(new URL('../ekodibiz-refund-policy-page.js', import.meta.url), 'utf8');
  const chrome = readFileSync(new URL('../scripts/site-chrome.mjs', import.meta.url), 'utf8');
  const address = '전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층';
  assert.match(canonicalPolicy, /다운로드·열람 등 제공이 개시되기 전에는 전액 환불/);
  assert.match(canonicalPolicy, /콘텐츠 하자나 제공 불가 시에는 전액 환불/);
  assert.match(checkoutHtml, /콘텐츠 제공이 시작되기 전 법정 청약철회 기간/);
  assert.match(checkoutHtml, /콘텐츠 하자·제공 불가 시/);
  assert.match(checkoutHtml, /href="https:\/\/ekodi\.kr\/ekodibiz\/refund"/);
  assert.match(commerce.policy.refund, /콘텐츠 제공이 시작되기 전 법정 청약철회 기간/);
  assert.match(commerce.policy.refund, /콘텐츠 하자 또는 제공 불가 시에는 전액 환불/);
  assert.doesNotMatch(checkoutHtml, /다운로드 후에는 파일 결함 시에만 환불/);
  assert.doesNotMatch(commerce.policy.refund, /다운로드 후에는 파일 결함이 있을 때만/);
  assert.ok(checkoutHtml.includes(address), 'buyer-visible merchant identity must match canonical EKODIBIZ');
  const booksChrome = chrome.split('  books: {')[1].split('  publishing: {')[0];
  assert.ok(booksChrome.includes(address), 'Books footer seller address must match canonical EKODIBIZ');
  assert.equal(commerce.policy.seller.includes('213-13-01959'), true);
});
