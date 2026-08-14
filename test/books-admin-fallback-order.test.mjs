import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');

test('secondary Books tabs follow the primary publishing operations tabs', () => {
  const start = source.indexOf('BOOKS_OPERATION_ORDER');
  const end = source.indexOf('];', start);
  const order = source.slice(start, end);
  assert.ok(order.indexOf("'publications'") < order.indexOf("'overview'"));
  assert.ok(order.indexOf("'royalties'") < order.indexOf("'overview'"));
});
