import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const access = fs.readFileSync(new URL('../client-access.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../client-access.css', import.meta.url), 'utf8');

test('central access admin replaces static summary cards with counted, accessible tabs', () => {
  assert.doesNotMatch(access, /client-access-summary/);
  assert.doesNotMatch(access, /shell\.summary\.replaceChildren/);
  assert.match(access, /section\.append\(head, tabs, toolbar, body\)/);
  assert.match(access, /tab\.textContent = count == null/);
  assert.match(access, /aria-selected/);
  assert.match(access, /ArrowRight/);
  assert.match(styles, /\.client-tab\.active/);
  assert.match(styles, /:focus-visible/);
});
test('leaving pending tab resets implicit pending-only filter', () => {
  assert.match(access, /else if \(shell\.status\.value === 'pre_registered'\) shell\.status\.value = ''/);
});
