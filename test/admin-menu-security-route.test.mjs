import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

test('central admin menu asset is protected by the admin asset route', () => {
  const adminAssets = worker.match(/const ADMIN_ASSETS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.ok(adminAssets, 'ADMIN_ASSETS allowlist must exist');
  assert.match(adminAssets, /['"]\/admin-menu-layout\.js['"]/);
  assert.match(worker, /withHostSecurity\(response, ADMIN_CSP,[^\n]*'admin-asset'\)/);
});
