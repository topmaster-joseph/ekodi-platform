import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkout = readFileSync(new URL('../books/buy/index.html', import.meta.url), 'utf8');
const purchase = readFileSync(new URL('../books/buy/buy.js', import.meta.url), 'utf8');
const library = readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');

test('checkout delivery copy describes the actual browser reader, not an EPUB save', () => {
  assert.match(checkout, /<a href="https:\/\/ekodi\.kr\/books\/library\/">내 서재<\/a>에서 ‘펼쳐 읽기’/);
  assert.match(checkout, /구매한 계정으로 로그인해 읽어 주세요/);
  assert.doesNotMatch(checkout, /EPUB 파일을 바로 받습니다|언제든 다시 받을 수 있습니다/);
  assert.match(purchase, /결제 후 내 서재에서 바로 읽으실 수 있습니다/);
  assert.match(library, /readBtn\.textContent = '펼쳐 읽기'/);
  assert.doesNotMatch(library, /readBtn\.textContent = 'EPUB 받기'/);
});

test('checkout still requires account login and leaves existing refund terms untouched', () => {
  assert.match(checkout, /구매하려면 EKODI 계정\(구글\)으로 로그인해 주세요/);
  assert.match(checkout, /다운로드 전에는 결제 후 7일 이내 전액 환불됩니다/);
  assert.match(purchase, /!quote\.signedIn/);
});
