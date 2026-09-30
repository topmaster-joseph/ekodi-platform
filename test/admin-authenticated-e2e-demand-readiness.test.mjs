import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E activates only the target demand menu before left navigation', () => {
  assert.doesNotMatch(source, /stage\('ready-demand'\)/);
  assert.match(source, /async function prepareTargetDemand\(\)/);
  assert.match(source, /\[data-demand-feature\]\[data-section=/);
  assert.match(source, /getAttribute\('data-demand-feature'\)/);
  assert.match(source, /await window\.EKODIAdminDemand\.activate\(key\)/);
  assert.doesNotMatch(source, /await clickFast\(placeholder\)/);
  assert.match(source, /!target\.hasAttribute\('data-demand-feature'\)/);
  assert.ok(source.indexOf('await prepareTargetDemand();') < source.indexOf('await selectWorkArea();'));
});


test('authenticated Admin E2E uses only the visible left submenu after contextual tabs are retired', () => {
  assert.match(source, /async function resolveMenuTrigger\(\)/);
  assert.match(source, /admin-detail-item\[data-admin-detail-section=/);
  assert.match(source, /data-admin-detail-more=/);
  assert.match(source, /no visible left-navigation trigger/);
  assert.match(source, /stage\('sidebar-trigger'\)/);
  assert.doesNotMatch(source, /admin-context-tab/);
});

test('authenticated Admin E2E resolves aliased demand-loader keys from the placeholder instead of menu ids', () => {
  assert.match(source, /const demandKey = String\(await placeholder\.getAttribute\('data-demand-feature'\)/);
  assert.match(source, /await window\.EKODIAdminDemand\.activate\(key\)/);
  assert.doesNotMatch(source, /await window\.EKODIAdminDemand\.activate\(section\)/);
});
