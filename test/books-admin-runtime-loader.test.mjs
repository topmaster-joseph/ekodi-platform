import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('static Books nav loads the real Books modules then hands off to the installed button', () => {
  assert.match(source, /await loadBooks\(\)/);
  assert.match(source, /button\.remove\(\)/);
  assert.match(source, /const realButton = nav\.querySelector\('\[data-section=\"books\"\]'\)/);
  assert.match(source, /queueMicrotask\(\(\) => realButton\.click\(\)\)/);
});
