import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AFFILIATE_PARTNER_PROGRAMS } from '../affiliate-partner-programs.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mall affiliate source selection is tenant scoped and fail-closed', async () => {
  const [api, workspace, migration] = await Promise.all([
    read('affiliate-control.js'),
    read('workspace-admin-page.js'),
    read('migrations/0089_affiliate_workspace_sources.sql'),
  ]);
  assert.match(api, /affiliate_workspace_sources/);
  assert.match(api, /current_site_activity_contexts/);
  assert.match(api, /WORKSPACE_MANAGE_ROLES/);
  assert.match(api, /selectionDoesNotBypassGlobalReadiness:true/);
  assert.match(api, /effectiveEnabled:selected && ready/);
  assert.match(api, /\/workspace\/sources/);
  assert.match(workspace, /workspaceAffiliateApi\('\/workspace\/sources'/);
  assert.match(workspace, /연결 대상 설정 저장/);
  assert.match(workspace, /애터미는 공식몰 참조 전용/);
  assert.match(migration, /affiliate_workspace_source_audit/);
});

test('target catalog includes domestic, global, China and official-reference routes', async () => {
  const api = await read('affiliate-control.js');
  for (const marker of ['elevenst-network-linkprice','amazon-direct-associates','trip-network-linkprice','agoda-network-linkprice','shein-network-adpick','taobao-network-taobao-alliance','aliexpress-network-affiliate','atomy-official-reference']) assert.match(api, new RegExp(marker));
  const atomy = AFFILIATE_PARTNER_PROGRAMS.find(item => item.key === 'atomy_official_reference');
  assert.equal(atomy?.kind, 'reference');
  assert.equal(atomy?.integration, 'manual');
  assert.equal(atomy?.api, 0);
  assert.match(atomy?.coverage || '', /재판매/);
});

test('professional supply network stays provider/program scoped while Mall owns route selection', async () => {
  const [panel, workspace, api] = await Promise.all([read('supply-network-admin.js'), read('workspace-admin-page.js'), read('affiliate-control.js')]);
  assert.doesNotMatch(panel, /api\('\/routes'\)|api\('\/accounts'\)/);
  assert.match(workspace, /workspaceAffiliateApi\('\/workspace\/sources'/);
  assert.match(workspace, /trackingStatus/);
  assert.match(workspace, /catalogStatus/);
  assert.match(api, /recommendedMerchantKeys\(env\.DB, 'ekodimall'\)/);
  assert.match(api, /affiliate_workspace_sources ws/);
});
