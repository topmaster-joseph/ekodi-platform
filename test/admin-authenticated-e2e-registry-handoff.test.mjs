import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuItem } from '../admin-menu-registry.js';

const workerSource = () => readFile(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E verifies direct registry href menus through isolated popup navigation', async () => {
  const cmpmyi = getAdminMenuItem('cmpmyi');
  assert.equal(cmpmyi?.href, 'https://ekodi.kr/cmpmyi/admin');
  assert.equal(cmpmyi?.adminHandoff, undefined);
  const source = await workerSource();
  assert.match(source, /async function verifyRegistryHref\(tab, started\)/);
  assert.match(source, /page\.waitForEvent\('popup'/);
  assert.match(source, /sourceTarget !== '_blank'/);
  assert.match(source, /popup\.waitForURL/);
  const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
  assert.match(sidebar, /definition\?\.href && definition\.adminHandoff !== true/);
  assert.match(sidebar, /window\.open\(destination\.href, '_blank', 'noopener'\)/);
  assert.match(source, /fetch\(expected\.href, \{ redirect:'manual'/);
  assert.match(source, /x-ekodi-route.*cmpmyi-store-portfolio-admin/);
  assert.match(source, /html\.includes\('통합 매장 운영'\)/);
  assert.match(source, /getAdminMenuItem\(menuId\)\?\.href && !getAdminMenuItem\(menuId\)\?\.adminHandoff/);
});
