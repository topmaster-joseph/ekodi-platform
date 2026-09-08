import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuItem } from '../admin-menu-registry.js';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('sales and supply network separates professional engine health from Mall operating decisions', async () => {
  const professional = getAdminMenuItem('supply-network');
  assert.equal(professional?.group, 'vertical');
  assert.equal(professional?.managementArea, 'professional-services');
  assert.equal(professional?.labels?.ko, '판매·공급망');
  assert.equal(getAdminMenuItem('affiliates'), null);
  assert.equal(isWorkspaceAdminPathShape('/ekodibiz/mall/admin/sourcing'), true);

  const demand = await read('admin-demand-loader.js');
  const professionalPanel = await read('supply-network-admin.js');
  const workspace = await read('workspace-admin-page.js');
  const layout = await read('admin-menu-layout.js');
  assert.match(demand, /'supply-network':[\s\S]*supply-network-admin\.js/);
  assert.match(professionalPanel, /api\('\/providers'\)/);
  assert.match(professionalPanel, /api\('\/programs'\)/);
  assert.match(professionalPanel, /outreachStatus/);
  assert.match(professionalPanel, /data-supply-program-save/);
  assert.match(professionalPanel, /method:'PUT'/);
  assert.match(professionalPanel, /https:\/\/api\.ekodi\.kr\/api\/affiliate/);
  assert.match(professionalPanel, /관리 ↗/);
  assert.doesNotMatch(professionalPanel, /api\('\/routes'\)|api\('\/accounts'\)/);
  assert.match(workspace, /sourcing:\['제휴·소싱'/);
  assert.match(workspace, /sourcing:POLICY\.capabilities\.supplyNetwork/);
  assert.doesNotMatch(workspace, /\/api\/affiliate\/accounts|affiliateMerchantRouteForm/);
  assert.match(layout, /LEGACY_MALL_AFFILIATE_HASHES/);
  assert.match(layout, /\/ekodibiz\/mall\/admin\/sourcing/);
});
