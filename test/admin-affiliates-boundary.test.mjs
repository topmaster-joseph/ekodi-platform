import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuItem } from '../admin-menu-registry.js';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('affiliate marketing account control stays inside central Admin while customer Mall Admin remains tenant-local', async () => {
  const definition = getAdminMenuItem('affiliates');
  assert.equal(definition?.href, undefined);
  assert.equal(definition?.adminHandoff, undefined);
  assert.equal(definition?.labels?.ko, '제휴마케팅');
  assert.equal(definition?.labels?.en, 'Affiliate Marketing');
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/'), true);

  const demand = await read('admin-demand-loader.js');
  const panel = await read('marketing-funnel-admin.js');
  const workspace = await read('workspace-admin-page.js');
  assert.match(demand, /affiliates:[\s\S]*label:'제휴마케팅'[\s\S]*marketing-funnel-admin\.js/);
  assert.match(panel, /button\.dataset\.section = 'affiliates'/);
  assert.match(panel, /panel\.dataset\.panel = 'affiliates'/);
  assert.match(panel, /제휴마케팅 계정 허브/);
  assert.match(panel, /제휴마케팅 계정 설정/);
  assert.match(panel, /affiliateAccountReadiness/);
  assert.match(panel, /affiliateRouteReadyCount/);
  assert.match(panel, /api\('\/api\/affiliate\/overview'\)/);
  assert.match(panel, /api\('\/api\/affiliate\/routes'\)/);
  assert.match(panel, /mallEvents\(\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(workspace, /\/api\/affiliate\/accounts/);
  assert.doesNotMatch(workspace, /affiliateMerchantRouteForm/);
});
