import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const workspace = fs.readFileSync(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');
const access = fs.readFileSync(new URL('../client-access.js', import.meta.url), 'utf8');

test('workspace admin keeps workload visible and makes metrics opt-in', () => {
  assert.match(workspace, /data-ekodi-admin-view-tabs/);
  assert.match(workspace, /id="summaryCards"[^>]*hidden/);
  assert.match(workspace, /id="mainPanel"[^>]*role="tabpanel"/);
  assert.match(workspace, /aria-controls="summaryCards"/);
  assert.match(workspace, /mountTenantAdminMetricsTabs/);
});

test('workspace admin delegates tab behavior to the common engine', () => {
  const source = workspace.slice(workspace.indexOf('function workspaceAdminCompact() {'), workspace.indexOf('const MALL_SOURCING_TABS_CSS='));
  assert.match(source, /return mountTenantAdminMetricsTabs\(\)/);
  assert.match(workspace, /const mountTenantAdminMetricsTabs=\$\{mountTenantAdminMetricsTabs\.toString\(\)\}/);
  assert.match(workspace, /WORKSPACE_ADMIN_VIEW_CSS\+tenantAdminMetricsTabsCss/);
});

test('user access toolbar uses counted tabs instead of redundant summary cards', () => {
  assert.doesNotMatch(access, /client-access-summary/);
  assert.match(access, /tab\.textContent = count == null/);
  assert.match(access, /aria-selected/);
  assert.match(access, /ArrowRight/);
  assert.match(access, /else if \(shell\.status\.value === 'pre_registered'\) shell\.status\.value = ''/);
});
