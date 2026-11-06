import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const libraryHelp = read('books/buy/library-tabs.js');
const library = read('books/buy/library.js');
const purchase = read('books/buy/index.html');
const checkout = read('books/buy/buy.js');
const commerce = JSON.parse(read('books/commerce.json'));

test('library help and checkout both describe the actual browser reader, not a file download', () => {
  assert.match(libraryHelp, /‘보유 도서’에서 ‘펼쳐 읽기’를 눌러 온라인 리더로 열람/);
  assert.doesNotMatch(libraryHelp, /EPUB 파일로 받을 수 있습니다|전자책 파일을 내려받/);
  assert.match(library, /readBtn\.textContent = '펼쳐 읽기'/);
  assert.match(purchase, /EPUB 전자책을 온라인 리더로 열람/);
  assert.match(checkout, /전자책 리더에서 열람/);
  assert.match(commerce.policy.delivery, /온라인 리더로 열람/);
});

test('audio availability is presented as gated, and reader ownership/authz stays server-checked', () => {
  assert.match(libraryHelp, /오디오북은 검수·승인된 경우 해당 도서 구매자에게 추가 결제 없이 제공/);
  assert.match(library, /item\.downloadReady/);
  assert.match(library, /C\.api\('library'\)/);
  assert.match(library, /download\/\$\{encodeURIComponent\(item\.id\)\}/);
  assert.doesNotMatch(libraryHelp, /영구 다운로드|무제한 저장/);
});
