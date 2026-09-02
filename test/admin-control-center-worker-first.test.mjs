import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrangler = readFileSync(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const siteWorker = readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');

test('admin Control Center aliases are Worker-first before Static Assets canonicalization', () => {
  for (const path of ['/control-center', '/control-center/', '/control-center.html']) {
    assert.ok(wrangler.includes(`"${path}"`), `${path} must remain in run_worker_first`);
    assert.ok(siteWorker.includes(`'${path}'`), `${path} must remain an admin alias in site-worker.js`);
  }
  assert.match(siteWorker, /Static Assets canonicalizes \*\.html URLs to extensionless paths/);
  assert.match(siteWorker, /'admin-retired'/);
});
