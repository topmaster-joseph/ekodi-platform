import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const compact = await readFile(new URL('../admin-menu-layout.compact.js', import.meta.url), 'utf8');

test('communication admin section has a stable canonical hash route', () => {
  assert.match(source, /#communication:communication/);
  assert.match(source, /communication:#communication/);
  assert.match(compact, /#communication:communication/);
  assert.match(compact, /communication:#communication/);
});
