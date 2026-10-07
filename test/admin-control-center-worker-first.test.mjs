import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrangler = readFileSync(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const siteWorker = readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');

test('control surfaces and retired admin aliases are Worker-first before Static Assets canonicalization', () => {
  assert.ok(wrangler.includes('"/control*"'), '/control* must keep control HTML/JS/CSS and retired aliases Worker-first');
  for (const path of ['/control-center', '/control-center/', '/control-center.html']) {
    assert.ok(siteWorker.includes(`'${path}'`), `${path} must remain an admin alias in site-worker.js`);
  }
  assert.match(siteWorker, /Static Assets canonicalizes \*\.html URLs to extensionless paths/);
  assert.match(siteWorker, /'admin-retired'/);
});
