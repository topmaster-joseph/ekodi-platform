import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E activates only the target demand menu before contextual navigation', () => {
  assert.doesNotMatch(source, /stage\('ready-demand'\)/);
  assert.match(source, /async function prepareTargetDemand\(\)/);
  assert.match(source, /\[data-demand-feature\]\[data-section=/);
  assert.match(source, /await window\.EKODIAdminDemand\.activate\(section\)/);
  const loader = readFileSync(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
  assert.match(loader, /'marketing-ai':'marketing'/);
  assert.match(loader, /'ai-membership':'aimembers'/);
  assert.match(loader, /const normalized=normalizeFeatureKey\(key\)/);
  assert.ok(loader.includes('`[data-demand-feature="${normalized}"]`'));
  assert.doesNotMatch(source, /await clickFast\(placeholder\)/);
  assert.match(source, /!target\.hasAttribute\('data-demand-feature'\)/);
  assert.ok(source.indexOf('await prepareTargetDemand();') < source.indexOf('await selectWorkArea();'));
});


test('authenticated Admin E2E uses the visible left submenu when contextual tabs are intentionally hidden', () => {
  assert.match(source, /async function resolveMenuTrigger\(\)/);
  assert.match(source, /admin-detail-item\[data-admin-detail-section=/);
  assert.match(source, /data-admin-detail-more=/);
  assert.match(source, /no visible sidebar navigation trigger/);
  assert.match(source, /stage\('sidebar-trigger'\)/);
  assert.doesNotMatch(source, /await tab\.waitFor\(\{ state: 'visible'/);
});
