import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('design tokens include core brand primitives', async () => {
  const css = await readFile(new URL('../tokens.css', import.meta.url), 'utf8');
  for (const token of ['--ekodi-color-brand', '--ekodi-color-surface', '--ekodi-font-sans']) {
    assert.match(css, new RegExp(token));
  }
});
