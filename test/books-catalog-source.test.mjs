// BOOKS-CATALOG-SOURCE-001: the versioned books/books.json must win over stale D1 rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../books/app.js', import.meta.url), 'utf8');
const mergeSource = source.match(/function mergeCatalog[\s\S]*?\n}\n/)?.[0];
const mergeCatalog = new Function(`${mergeSource}return mergeCatalog;`)();
const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));

test('static catalog wins over a stale D1 row matched by legacyId', () => {
  const merged = mergeCatalog(catalog, { books: [{ id: 'ekodi-books-001', status: 'FORTHCOMING · 2026' }] });
  assert.equal(merged.books.length, catalog.books.length);
  assert.equal(merged.books[0].status, catalog.books[0].status);
});

test('admin-created public D1 titles still appear; private ones do not', () => {
  const merged = mergeCatalog(catalog, { books: [{ id: 'd1-only', title: 'X', isPublic: true }, { id: 'd1-private', isPublic: false }] });
  assert.ok(merged.books.some(book => book.id === 'd1-only'));
  assert.ok(!merged.books.some(book => book.id === 'd1-private'));
});

test('either source alone still renders a catalog', () => {
  assert.equal(mergeCatalog(catalog, undefined).books.length, catalog.books.length);
  assert.equal(mergeCatalog(undefined, { books: [{ id: 'a' }] }).books.length, 1);
  assert.equal(mergeCatalog(undefined, undefined).books.length, 0);
});

test('storefront loads the static catalog under the /books mount', () => {
  assert.match(source, /catalogBase\(\)\}\/books\.json/);
  assert.match(source, /startsWith\('\/books\/'\)/);
});

test('titles without a verified sale link publish no price offer', () => {
  for (const book of catalog.books) {
    const saleUrl = book.links?.upaper || book.links?.korea;
    if (!saleUrl) assert.equal(Number(book.listPrice.amount), 0, `${book.id} must not advertise a price without a sale link`);
  }
});
