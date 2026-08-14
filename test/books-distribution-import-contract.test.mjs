import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Distribution import validates every row before any D1 write', async () => {
  const control = await read('books-distribution-control.js');
  for (const marker of [
    'IMPORT_LIMIT = 500',
    "path === `${PREFIX}/import`",
    '데이터는 저장되지 않았습니다.',
    'duplicateKeys',
    "syncMode: 'csv'",
    'env.DB.batch',
    'books.distribution.import.csv',
  ]) assert.ok(control.includes(marker), `missing import control marker: ${marker}`);
  assert.ok(control.indexOf('if (errors.length) return json') < control.indexOf('await env.DB.batch(normalized.map'), 'server must validate all rows before batch write');
});

test('Distribution import UI provides template, preview and explicit reconciliation semantics', async () => {
  const ui = await read('books-distribution-import-admin.js');
  for (const marker of [
    'CSV Import',
    'Template',
    'Import Verified Rows',
    'publication_id',
    'channel_code',
    'source_status',
    '/api/books/admin/distribution/import',
    'EKODI가 임의로 상태를 추정하지 않습니다.',
    '2_000_000',
  ]) assert.ok(ui.includes(marker), `missing import UI marker: ${marker}`);
});

test('Distribution import is bundled into secured lazy Books operations assets', async () => {
  const build = await read('scripts/build.mjs');
  const pkg = await read('package.json');
  for (const marker of ['books-distribution-import-admin.css', 'books-distribution-import-admin.js']) {
    assert.ok(build.includes(marker), `missing build marker: ${marker}`);
  }
  assert.ok(pkg.includes('node --check books-distribution-import-admin.js'));
});

test('Distribution import rejects unsupported normalized statuses and non-http URLs', async () => {
  const control = await read('books-distribution-control.js');
  assert.ok(control.includes("const BOOK_STATUSES = new Set(['not_started', 'preparing', 'submitted', 'reviewing', 'action_required', 'approved', 'published', 'paused', 'rejected'])"));
  assert.ok(control.includes("['https:', 'http:'].includes(url.protocol)"));
});
