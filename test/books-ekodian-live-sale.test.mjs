import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [catalogText, app, detail, series, workspace] = await Promise.all([
  readFile(new URL('../books/books.json', import.meta.url), 'utf8'),
  readFile(new URL('../books/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../books/ekodian/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../books/series/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../books/publishing/workspace/index.html', import.meta.url), 'utf8'),
]);
const catalog=JSON.parse(catalogText);
const book=catalog.books.find(item=>item.id==='BOOK-EKODI-000001');

test('EKODIan is listed as a live 9,900 KRW UPaper sale',()=>{
  assert.ok(book);
  assert.equal(book.status,'On Sale · 2026');
  assert.equal(book.listPrice.amount,9900);
  assert.equal(book.workflow.distribution,'live');
  assert.equal(book.workflow.storefront,'live');
  assert.equal(book.distribution.upaper,'판매 중');
  assert.equal(book.links.upaper,'https://ekodi.upaper.kr/content/1223429');
  assert.equal(book.links.korea,book.links.upaper);
});
test('public detail exposes the external sale CTA and structured Offer',()=>{
  assert.match(detail,/https:\/\/ekodi\.upaper\.kr\/content\/1223429/);
  assert.match(detail,/9,900원 · 전자책 구매하기/);
  assert.match(detail,/유페이퍼 · 판매 중/);
  assert.match(detail,/"@type":"Offer"/);
  assert.doesNotMatch(detail,/forthcoming 2026/);
});
test('catalog, series and publisher workspace agree on live sale state',()=>{
  assert.match(app,/유페이퍼 구매/);
  assert.match(app,/schema\.org\/InStock/);
  assert.match(series,/On Sale · 2026/);
  assert.match(workspace,/유통 상태 <b>유페이퍼 판매 중<\/b>/);
  assert.match(workspace,/서점 노출 <b>판매 링크 활성화<\/b>/);
  assert.match(workspace,/실판매 페이지/);
});
