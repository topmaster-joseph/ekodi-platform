import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../church-i18n-extended.js', import.meta.url), 'utf8');

test('extended locale reruns translations requested during fallback capture', () => {
  assert.match(source, /let rerunRequested=false;/);
  assert.match(source, /if\(capturing\|\|scheduled\)\{rerunRequested=true;return;\}/);
  assert.match(source, /if\(rerunRequested\)\{rerunRequested=false;schedule\(\);\}/);
});
