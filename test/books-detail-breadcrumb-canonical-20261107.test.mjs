import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../books/book/index.html',import.meta.url),'utf8');
const script = readFileSync(new URL('../books/book/book.js',import.meta.url),'utf8');

test('book details always return to the bookstore rather than EKODI platform root',()=>{
  const breadcrumb = html.match(/<p class="breadcrumb">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(breadcrumb);
  assert.match(breadcrumb,/href="https:\/\/ekodi\.kr\/books\/"[^>]*>에코디서점<\/a>/);
  assert.match(breadcrumb,/href="https:\/\/ekodi\.kr\/books\/#catalog"[^>]*>Books<\/a>/);
  assert.doesNotMatch(breadcrumb,/href="\/"|href="\/#catalog"/);
});

test('missing-book fallback stays in canonical bookstore and does not offer a broken root URL',()=>{
  const missing = html.match(/<section class="detail-section shell" id="missing"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(missing);
  assert.match(missing,/href="https:\/\/ekodi\.kr\/books\/#catalog"/);
  assert.doesNotMatch(missing,/href="\/#catalog"/);
});

test('detail identity and checkout remain based on immutable book ID and current server sale gate',()=>{
  assert.match(script,/const canonical = `https:\/\/ekodi\.kr\/books\/book\/\?id=\$\{encodeURIComponent\(book\.id\)\}`/);
  assert.match(script,/saleReady\(book\)/);
  assert.match(script,/under\(`\/buy\/\?book=\$\{encodeURIComponent\(book\.id\)\}`\)/);
});
