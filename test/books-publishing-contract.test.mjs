import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [api, admin, build, loader, siteWorker, booksWorker, publishingHtml, publishingApp, migration] = await Promise.all([
  read('books-control.js'), read('books-admin.js'), read('scripts/build.mjs'), read('admin-demand-loader.js'),
  read('site-worker.js'), read('books-worker.js'), read('books/publishing/index.html'),
  read('books/publishing/app.js'), read('migrations/0009_books_operations.sql')
]);

test('Books control plane exposes publications, services, features and inquiries', () => {
  assert.match(api, /const PUBLIC_PREFIX = '\/api\/books\/public'/);
  assert.match(api, /const ADMIN_PREFIX = '\/api\/books\/admin'/);
  for (const table of ['books_service_catalog', 'books_feature_flags', 'books_inquiries', 'books_publications']) {
    assert.match(migration, new RegExp(table));
  }
});

test('Books is registry-driven and loads heavy admin assets only on demand', () => {
  for (const asset of ['books-admin.css', 'books-admin.js', 'books-finance-admin.css', 'books-finance-admin.js']) {
    assert.ok(build.includes(`'${asset}'`));
  }
  assert.match(loader, /books:\s*\{/);
  assert.match(loader, /styles:\['books-admin\.css'\]/);
  assert.match(loader, /scripts:\['books-admin\.js'\]/);
  assert.match(loader, /secondaryStyles:\['books-finance-admin\.css'\]/);
  assert.match(loader, /secondaryScripts:\['books-finance-admin\.js'\]/);
});
test('Books remains secured and public publishing keeps pricing plus consultation', () => {
  assert.match(admin, /에코디서점 관리/);
  assert.match(siteWorker, /'\/books'/);
  assert.match(siteWorker, /'\/books-admin\.js'/);
  assert.match(publishingHtml, /출판상담 · 출판대행/);
  assert.match(publishingHtml, /id="consultationForm"/);
  assert.match(publishingHtml, /id="pricing"/);
  assert.match(publishingApp, /\/api\/books\/inquiries/);
  assert.match(booksWorker, /admin\.ekodi\.kr\/books#books/);
});
