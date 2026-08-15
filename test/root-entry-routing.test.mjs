import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('EKODI public homepage is an explicit secured Worker route', () => {
  assert.match(wrangler, /pattern = "ekodi\.kr"/);
  assert.match(wrangler, /pattern = "www\.ekodi\.kr"/);
  assert.match(worker, /const PUBLIC_HOST = 'ekodi\.kr'/);
  assert.match(worker, /PUBLIC_ALIAS_HOSTS = new Set\(\['www\.ekodi\.kr'\]\)/);
  assert.match(worker, /'public-home'/);
  assert.match(worker, /'public-asset'/);
  assert.match(worker, /PUBLIC_CSP/);
  assert.match(worker, /'no-store', 'public-home'/);
});

test('Chief AI lazy admin bootstrap is served through the secured admin asset route', () => {
  assert.match(worker, /'\/admin-lazy-features\.js'/);
  assert.match(worker, /ADMIN_ASSETS[\s\S]*withHostSecurity\(response, ADMIN_CSP, 'public, max-age=0, must-revalidate', 'admin-asset'\)/);
});
