import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('Books sidebar entry is inserted before Finance', () => {
  assert.match(source, /const finance = nav\.querySelector\('\[data-section=\"finance\"\]'\)/);
  assert.match(source, /nav\.insertBefore\(button, finance\)/);
});
