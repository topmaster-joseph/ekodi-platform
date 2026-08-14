import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('Books operations tabs are ordered for day-to-day publishing work', () => {
  const order = "['publications', 'assets', 'governance', 'pipeline', 'distribution', 'finance', 'royalties', 'overview', 'inquiries', 'services', 'features']";
  assert.ok(source.includes(order));
  assert.match(source, /tabs\.append\(tab\)/);
});
