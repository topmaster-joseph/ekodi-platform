import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin startup does not auto-load heavy operational workspaces', async () => {
  const shell = await read('admin-authenticated-shell.js');
  const criticalBlock = shell.match(/const criticalPostAuthScripts = \[([\s\S]*?)\];/)?.[1] || '';
  assert.match(criticalBlock, /admin-demand-loader\.js/);
  for (const heavy of ['ai-ops-admin.js', 'admin-lazy-features.js', 'release-control-admin.js', 'work-admin.js', 'marketing-ai-admin.js']) {
    assert.doesNotMatch(criticalBlock, new RegExp(heavy.replaceAll('.', '\\.')));
  }
  assert.doesNotMatch(shell, /scheduleDeferredFeatures/);
  assert.doesNotMatch(shell, /observer\.observe\(content, \{ childList:true, subtree:true, attributes:true/);
});

test('heavy admin modules are explicit on-demand features', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.doesNotThrow(() => new Function(loader));
  for (const asset of ['ai-ops-admin.js', 'admin-lazy-features.js', 'release-control-admin.js', 'work-admin.js', 'marketing-ai-admin.js']) {
    assert.match(loader, new RegExp(asset.replaceAll('.', '\\.')));
  }
  assert.match(loader, /author-billing-admin\.js/);
  assert.match(loader, /system-health-admin\.js/);
  assert.doesNotMatch(loader, /setInterval\([^)]*loadDevices/);
});

test('on-demand assets are independently served and not merged into startup bundles', async () => {
  const worker = await read('site-worker.js');
  const build = await read('scripts/build.mjs');
  for (const asset of ['/admin-demand-loader.js', '/author-billing-admin.js', '/system-health-admin.js']) assert.match(worker, new RegExp(asset.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  assert.match(build, /'admin-demand-loader\.js'/);
  assert.match(build, /'author-billing-admin\.js'/);
  assert.match(build, /'system-health-admin\.js'/);
  assert.doesNotMatch(build, /releaseJs.*systemHealthJs/);
  assert.doesNotMatch(build, /lazyJs.*authorBillingJs/);
});

test('immutable Admin fingerprint includes unified homepage management', async () => {
  const performancePostbuild = await read('scripts/admin-performance-postbuild.mjs');
  const versionBlock = performancePostbuild.match(/const versionInputs = \[([\s\S]*?)\];/)?.[1] || '';
  assert.match(versionBlock, /'campus-actions\.js'/);
  assert.match(versionBlock, /'homepage-admin\.js'/);
});

// Release trigger checkpoint: shared-site manifest v8 is validated by the guarded production gate.
