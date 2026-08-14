import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [api, admin, build, featureLoader, siteWorker, booksWorker, publishingHtml, publishingApp, migration] = await Promise.all([
  readFile(new URL('../books-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../books-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../control-center-features.js', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../books-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../books/publishing/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../books/publishing/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0009_books_operations.sql', import.meta.url), 'utf8'),
]);

test('Books control plane exposes publications, services, features and inquiries', () => {
  assert.match(api, /const PUBLIC_PREFIX = '\/api\/books\/public'/);
  assert.match(api, /const ADMIN_PREFIX = '\/api\/books\/admin'/);
  assert.match(api, /\$\{PUBLIC_PREFIX\}\/config/);
  assert.match(api, /\$\{PUBLIC_PREFIX\}\/publications/);
  assert.match(api, /'\/api\/books\/inquiries'/);
  assert.match(api, /\$\{ADMIN_PREFIX\}\/overview/);
  for (const table of ['books_service_catalog', 'books_feature_flags', 'books_inquiries', 'books_publications']) {
    assert.match(migration, new RegExp(table));
  }
});

test('Books admin ships with the Control Center, stays visible in navigation, and loads heavy modules only when opened', () => {
  for (const asset of ['books-admin.css', 'books-admin.js', 'books-finance-admin.css', 'books-finance-admin.js']) {
    assert.ok(build.includes(`'${asset}'`), `${asset} must remain in production assets`);
  }
  assert.match(build, /'control-center-features\.js'/);
  assert.doesNotMatch(build, /<link rel="stylesheet" href="books-admin\.css">/);
  assert.doesNotMatch(build, /<script src="books-admin\.js" defer><\/script>/);
  assert.match(featureLoader, /loadStyle\('books-admin\.css'\)/);
  assert.match(featureLoader, /loadStyle\('books-finance-admin\.css'\)/);
  assert.match(featureLoader, /loadModule\('books-admin\.js'\)/);
  assert.match(featureLoader, /loadModule\('books-finance-admin\.js'\)/);
  assert.match(featureLoader, /import\(`\.\/\$\{src\}`\)/);
  assert.doesNotMatch(featureLoader, /requestIdleCallback/);
  assert.match(featureLoader, /installStaticBooksNavigation/);
  assert.match(featureLoader, /button\.dataset\.section = 'books'/);
  assert.match(featureLoader, /await loadBooks\(\)/);
  assert.match(admin, /Books Control/);
  assert.match(admin, /Pricing & Services/);
  assert.match(admin, /Consultations/);
  assert.match(siteWorker, /'\/books'/);
  assert.match(siteWorker, /'\/books-admin\.js'/);
  assert.match(siteWorker, /'\/books-finance-admin\.js'/);
});

test('Public publishing page has transparent pricing and consultation submission', () => {
  assert.match(publishingHtml, /출판상담 · 출판대행/);
  assert.match(publishingHtml, /id="consultationForm"/);
  assert.match(publishingHtml, /id="pricing"/);
  assert.match(publishingApp, /digital-start/);
  assert.match(publishingApp, /publish-pro/);
  assert.match(publishingApp, /\/api\/books\/inquiries/);
  assert.match(booksWorker, /admin\.ekodi\.kr\/books#books/);
});
