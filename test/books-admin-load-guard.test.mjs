import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../books-admin.js', import.meta.url), 'utf8');

test('Books admin permits only one overview load at a time', () => {
  assert.match(source, /let loading = false/);
  assert.match(source, /async function load\(\) \{\s*if \(loading\) return;/);
  assert.match(source, /loading = true;/);
  assert.match(source, /finally \{\s*loading = false;\s*\}/);
});

test('Books admin no longer observes the whole document during rendering', () => {
  assert.doesNotMatch(source, /new MutationObserver/);
  assert.doesNotMatch(source, /subtree\s*:\s*true/);
  assert.doesNotMatch(source, /childList\s*:\s*true/);
});
