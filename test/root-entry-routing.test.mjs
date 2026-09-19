import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');

test('EKODI public homepage is an explicit secured apex Worker route', () => {
  const custom = wrangler.split('[[routes]]').slice(1)
    .filter(block => /custom_domain\s*=\s*true/.test(block))
    .map(block => block.match(/pattern\s*=\s*"([^"]+)"/)?.[1])
    .filter(Boolean);
  assert.deepEqual(custom, ['ekodi.kr']);
  assert.match(worker, /const PUBLIC_HOST = 'ekodi\.kr'/);
  assert.match(worker, /'public-home'/);
  assert.match(worker, /'public-asset'/);
  assert.match(worker, /PUBLIC_CSP/);
  assert.match(worker, /'no-store', 'public-home'/);
});

test('Chief AI lazy admin bootstrap is served through the secured version-aware admin asset route', () => {
  assert.match(worker, /'\/admin-lazy-features\.js'/);
  assert.match(worker, /function adminAssetCacheControl\(url\)/);
  assert.match(worker, /ADMIN_ASSETS[\s\S]*withHostSecurity\(response, ADMIN_CSP, adminAssetCacheControl\(url\), 'admin-asset'\)/);
});
