import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('Books is a stable sidebar entry and loads the complete operations tab set', () => {
  assert.match(source, /installStaticBooksNavigation/);
  assert.match(source, /button\.dataset\.section = 'books'/);
  assert.match(source, /BOOKS_OPERATION_ORDER = \['publications', 'assets', 'governance', 'pipeline', 'distribution', 'finance', 'royalties'/);
  assert.match(source, /data-books-tab=\"assets\"/);
  assert.match(source, /data-books-tab=\"governance\"/);
  assert.match(source, /verifyBooksOperationTabs/);
  for (const name of ['publications', 'assets', 'governance', 'pipeline', 'distribution', 'finance', 'royalties']) {
    assert.match(source, new RegExp(`['\"]${name}['\"]`));
  }
});

test('Assets and Governance are honest readiness views, not fake upload controls', () => {
  assert.match(source, /파일 업로드를 가장하지 않고/);
  assert.match(source, /PUBLIC RELEASE GATE/);
  assert.match(source, /requestBooksOverview/);
});
