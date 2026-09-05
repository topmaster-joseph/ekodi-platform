import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Devotional admin renders immediately and refreshes without blocking navigation', async () => {
  const [admin, deploy] = await Promise.all([
    readFile(new URL('../devotional-admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(admin, /let loadingPromise=null/);
  assert.match(admin, /if\(!button\.dataset\.section\)button\.dataset\.section='devotional'/);
  assert.match(admin, /AbortSignal\.timeout\(8000\)/);
  assert.match(admin, /if\(loadingPromise\)return loadingPromise/);
  assert.match(admin, /render\(fallback\(\)\);\s*button\.addEventListener/);
  assert.ok(deploy.includes("- 'devotional-admin.js'"));
  assert.ok(deploy.includes("- 'devotional-admin.css'"));
  assert.match(deploy, /ai-ops-admin\.js devotional-admin\.js/);
  assert.match(deploy, /dist\/ai-ops-admin\.css dist\/devotional-admin\.js dist\/devotional-admin\.css/);
});