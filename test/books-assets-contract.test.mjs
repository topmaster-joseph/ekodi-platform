import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Books assets migration creates additive edition and asset versioning tables', async () => {
  const sql = await read('migrations/0014_books_publication_assets.sql');
  for (const marker of ['books_editions','books_publication_assets','checksum_sha256','storage_ref','source_url','version_label','superseded','withdrawn']) {
    assert.ok(sql.includes(marker), `missing asset schema marker: ${marker}`);
  }
  assert.equal(/DROP\s+TABLE/i.test(sql), false);
});

test('Books assets API enforces release preflight and immutable release transition path', async () => {
  const control = await read('books-assets-control.js');
  for (const marker of ['Release Preflight','SHA-256','Storage Reference','cover','epub','pdf','edition.release','edition.withdraw','asset.archive']) {
    assert.ok(control.includes(marker), `missing assets API marker: ${marker}`);
  }
  assert.ok(control.includes("requestedStatus === 'released'"));
  assert.ok(control.includes("status='superseded'"));
  assert.ok(control.includes("status='released'"));
});

test('Books asset integrity accepts only sha256 hex and http/https source URLs', async () => {
  const control = await read('books-assets-control.js');
  assert.ok(control.includes('/^[a-f0-9]{64}$/.test(text)'));
  assert.ok(control.includes("['https:', 'http:'].includes(url.protocol)"));
});

test('Books assets admin hashes selected local files without claiming upload', async () => {
  const ui = await read('books-assets-admin.js');
  for (const marker of ['Assets','Release Preflight','crypto.subtle.digest','SHA-256','파일 자체는 업로드하지 않습니다.','Storage Reference','/api/books/admin/assets']) {
    assert.ok(ui.includes(marker), `missing assets UI marker: ${marker}`);
  }
  assert.equal(ui.includes('FormData('), false, 'asset UI must not fake a file-upload path');
});

test('Canonical Control API routes assets before generic Books controller', async () => {
  const entry = await read('customer-entry-worker.js');
  const assets = entry.indexOf("path.startsWith('/api/books/admin/assets')");
  const generic = entry.indexOf('handleBooksRequest(request, env)');
  assert.ok(entry.includes("import { handleBooksAssetsRequest } from './books-assets-control.js'"));
  assert.ok(assets >= 0 && generic > assets);
});
