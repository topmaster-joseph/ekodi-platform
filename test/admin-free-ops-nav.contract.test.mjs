import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../release-control-admin.js', import.meta.url), 'utf8');

test('admin sidebar exposes Mall Free Ops safely before advanced domain controls', () => {
  assert.match(js, /https:\/\/mall\.ekodi\.kr\/free-ops/);
  assert.match(js, /Mall · Free Ops/);
  assert.match(js, /dataset\.adminLink = 'mall-free-ops'/);
  assert.match(js, /target = '_blank'/);
  assert.match(js, /rel = 'noopener'/);
  assert.match(js, /getAttribute\('href'\) === '\/legacy#domains'/);
  assert.match(js, /insertBefore\(link, domains\)/);
});
