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

test('AI membership admin presents the Core-first execution policy', async () => {
  const panel = await read('user-ai-tier-panel.js');
  assert.match(panel, /Core 우선 · AI 필요 시 자동 선택/);
  assert.match(panel, /대체 경로 준비됨/);
  assert.doesNotMatch(panel, /개인 API → EKODI → 개인 Web → Core/);
  assert.match(panel, /자동화·백그라운드·관리자·시스템 실행은 소비자 Web 세션에 의존하지 않습니다/);
});

// Release trigger checkpoint: shared-site manifest v8 is validated by the guarded production gate.
