import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('Books loader verifies the required operation tabs after module install', () => {
  assert.match(source, /verifyBooksOperationTabs\(\)/);
  assert.match(source, /missing operation tabs/);
});
