import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Books pipeline migration adds operational metadata and normalizes channel codes', async () => {
  const sql = await read('migrations/0012_books_operations_pipeline.sql');
  for (const marker of ['source_status', 'assignee', 'due_at', 'checklist_json', 'sync_mode', 'synced_at', "'google-play-books'", "'ridibooks'"]) {
    assert.ok(sql.includes(marker), `missing migration marker: ${marker}`);
  }
  assert.ok(sql.includes("UPDATE books_finance_transactions SET channel_code = 'google-play-books'"));
  assert.ok(sql.includes("UPDATE books_finance_transactions SET channel_code = 'ridibooks'"));
});

test('Books pipeline API aggregates lifecycle, distribution and finance data', async () => {
  const control = await read('books-pipeline-control.js');
  for (const marker of ['/api/books/admin/pipeline', 'books_publications', 'books_distribution_status', 'books_finance_transactions', 'publishedPlacements', 'nextAction', 'unsettled']) {
    assert.ok(control.includes(marker), `missing pipeline API marker: ${marker}`);
  }
});

test('Books distribution API preserves extended operational fields', async () => {
  const control = await read('books-distribution-control.js');
  for (const marker of ['sourceStatus', 'assignee', 'dueAt', 'checklist', 'syncMode', 'syncedAt', 'CHECKLIST_KEYS']) {
    assert.ok(control.includes(marker), `missing distribution ops marker: ${marker}`);
  }
});

test('Books pipeline UI links production, distribution and finance', async () => {
  const ui = await read('books-pipeline-admin.js');
  for (const marker of ['Pipeline', '출판 · 배포 · 매출 통합 파이프라인', 'Publication', 'Distribution', 'Sales & Costs', 'CHANNEL OPS', 'CSV Export']) {
    assert.ok(ui.includes(marker), `missing pipeline UI marker: ${marker}`);
  }
  assert.ok(ui.includes("'/api/books/admin/pipeline'"));
  assert.ok(ui.includes('/api/books/admin/distribution/status/'));
});

test('Books build bundles pipeline into secured lazy Books assets', async () => {
  const build = await read('scripts/build.mjs');
  for (const marker of ['books-pipeline-admin.css', 'books-pipeline-admin.js', 'books-pipeline-bridge.js', 'books-finance-admin.css', 'books-finance-admin.js']) {
    assert.ok(build.includes(marker), `missing build marker: ${marker}`);
  }
});

test('Canonical Control API entry routes Books pipeline before generic Books handling', async () => {
  const entry = await read('customer-entry-worker.js');
  const wrangler = await read('wrangler.api.toml');
  assert.ok(entry.includes("import { handleBooksPipelineRequest } from './books-pipeline-control.js'"));
  const pipelineRoute = entry.indexOf("path.startsWith('/api/books/admin/pipeline')");
  const genericBooks = entry.indexOf('handleBooksRequest(request, env)');
  assert.ok(pipelineRoute >= 0, 'pipeline route missing');
  assert.ok(genericBooks > pipelineRoute, 'pipeline route must run before generic Books controller');
  assert.ok(wrangler.includes('main = "customer-entry-worker.js"'));
  assert.ok(wrangler.includes('crons = ["*/10 * * * *"]'));
});
