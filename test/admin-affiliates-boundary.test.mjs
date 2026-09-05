import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuItem } from '../admin-menu-registry.js';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mall AI Sales stays inside central Admin while customer Mall Admin remains tenant-local', async () => {
  const definition = getAdminMenuItem('affiliates');
  assert.equal(definition?.href, undefined);
  assert.equal(definition?.adminHandoff, undefined);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/'), true);

  const demand = await read('admin-demand-loader.js');
  const panel = await read('marketing-funnel-admin.js');
  assert.match(demand, /affiliates:[\s\S]*marketing-funnel-admin\.js/);
  assert.match(panel, /button\.dataset\.section = 'affiliates'/);
  assert.match(panel, /panel\.dataset\.panel = 'affiliates'/);
  assert.match(panel, /api\('\/api\/affiliate\/overview'\)/);
  assert.match(panel, /mallEvents\(\)\.catch\(\(\) => \[\]\)/);
});
