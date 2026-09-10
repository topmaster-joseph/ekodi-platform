import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuItem } from '../admin-menu-registry.js';

const workerSource = () => readFile(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E verifies direct registry href menus as real navigations', async () => {
  const cmpmyi = getAdminMenuItem('cmpmyi');
  assert.equal(cmpmyi?.href, 'https://ekodi.kr/cmpmyi/admin');
  assert.equal(cmpmyi?.adminHandoff, undefined);
  const source = await workerSource();
  assert.match(source, /async function verifyRegistryHref\(tab, started\)/);
  assert.match(source, /page\.waitForResponse\(response =>/);
  assert.match(source, /request\.isNavigationRequest\(\)/);
  assert.match(source, /x-ekodi-route.*cmpmyi-store-portfolio-admin/);
  assert.match(source, /html\.includes\('통합 매장 운영'\)/);
  assert.match(source, /getAdminMenuItem\(menuId\)\?\.href && !getAdminMenuItem\(menuId\)\?\.adminHandoff/);
});
