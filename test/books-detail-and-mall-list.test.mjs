// BOOKS-DETAIL-001 · MALL-LIST-IMAGE-001
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shortSummary } from '../sites/ekodi-mall/scripts/build.mjs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('books/books.json'));

test('every catalogued book has a detail page target; TOC comes from the uploaded EPUBs', () => {
  for (const b of catalog.books) assert.ok(b.detailUrl && b.detailUrl !== '/#catalog', b.id);
  const ko = catalog.books.find(b => b.id === 'BOOK-EKODI-000001');
  const en = catalog.books.find(b => b.id === 'BOOK-EKODI-000003');
  assert.equal(ko.toc.length, 26); assert.equal(en.toc.length, 26);
  assert.ok(en.toc.every(t => !/[가-힣]/.test(t)), 'English TOC is English only');
  assert.equal(catalog.books.find(b => b.id === 'BOOK-EKODI-000002').toc, undefined, 'no invented TOC');
});

test('shared detail page shows TOC, never offers checkout for an unready book, and mounts paths once', () => {
  const js = read('books/book/book.js');
  assert.match(js, /if \(saleReady\(book\)\)/);
  assert.match(js, /출간 준비 중/);
  assert.match(js, /목차는 출간 확정 후 공개됩니다/);
  assert.match(js, /v\.startsWith\(`\$\{base\}\/`\)/);
  assert.match(read('books/book/index.html'), /id="toc"/);
});

test('mall list cards use the real image and keep the summary short', () => {
  const build = read('sites/ekodi-mall/scripts/build.mjs');
  assert.match(build, /class="thumb-link" href="\$\{href\}"/);
  assert.match(build, /product\.image \? `<img src=/);
  assert.equal(shortSummary('짧은 설명'), '짧은 설명');
  assert.equal(shortSummary('첫 문장입니다. 두 번째 문장은 목록에 나오지 않습니다.'), '첫 문장입니다.');
  assert.ok(shortSummary('가'.repeat(80)).length <= 46);
  const live = read('sites/ekodi-mall/assets/marketplace-live.js');
  assert.match(live, /item\.image/);
  assert.match(read('sites/ekodi-mall/api/entry.js'), /image: \(row\.images_json \? publicImages\(row\.images_json, null\)\[0\]\?\.url : ''\) \|\| ''/);
});
