import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('Books readiness shells use the canonical authenticated Books overview API', () => {
  assert.match(source, /https:\/\/api\.ekodi\.kr\/api\/books\/admin\/overview/);
  assert.match(source, /authorization/);
  assert.match(source, /Bearer \$\{token\(\)\}/);
});
