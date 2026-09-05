import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin startup keeps only shell, navigation and demand loader on the critical path', async () => {
  const shell = await read('admin-authenticated-shell.js');
  const criticalBlock = shell.match(/const criticalPostAuthScripts\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  const deferredBlock = shell.match(/const deferredPostAuthScripts\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  assert.match(criticalBlock, /admin-demand-loader\.js/);
  assert.match(criticalBlock, /admin-menu-layout\.js/);
  assert.doesNotMatch(criticalBlock, /ekodi-message-ui\.js|google-admin-auth\.js/);
  assert.match(deferredBlock, /ekodi-message-ui\.js/);
  assert.match(deferredBlock, /google-admin-auth\.js/);
  assert.match(shell, /requestAnimationFrame\(\(\)=>requestAnimationFrame/);
  assert.match(shell, /for\(const src of criticalPostAuthScripts\)/);
  assert.match(shell, /await loadScript\(src\)/);
  assert.match(shell, /window\.EKODIAdminPanels\.activate\(requestedSection\(\)\)/);
  assert.doesNotMatch(shell, /for\(let i=0;i<8|waitForMenuRuntime/);
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

test('device browser diagnostics are shipped and stay on the immutable admin worker path', async () => {
  const build = await read('scripts/build.mjs');
  const worker = await read('site-worker.js');
  const wrangler = await read('wrangler.site.toml');
  const diagnostics = await read('device-browser-diagnostics.js');
  const manifest = JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  assert.match(build, /'device-browser-diagnostics\.css'/);
  assert.match(build, /'device-browser-diagnostics\.js'/);
  assert.match(worker, /'\/device-browser-diagnostics\.css'/);
  assert.match(worker, /'\/device-browser-diagnostics\.js'/);
  assert.match(worker, /url\.searchParams\.has\('v'\)[\s\S]*max-age=31536000, immutable/);
  const workerFirst = wrangler.match(/run_worker_first = \[([\s\S]*?)\]/)?.[1] || '';
  assert.match(workerFirst, /"\/device-browser-diagnostics\.js"/);
  assert.match(workerFirst, /"\/device-browser-diagnostics\.css"/);
  assert.match(diagnostics, /CACHE_ALLOWLIST/);
  assert.match(diagnostics, /registration\.update\(\)/);
  assert.match(diagnostics, /현재 관리자 브라우저 진단/);
  const smoke = JSON.stringify(manifest.smoke || manifest);
  assert.match(smoke, /device-browser-diagnostics\.js\?v=device-v28/);
  assert.match(smoke, /device-browser-diagnostics\.css\?v=device-v28/);
  assert.match(smoke, /x-ekodi-route: admin-asset/);
  assert.match(smoke, /cache-control: public, max-age=31536000, immutable/);
  assert.match(smoke, /현재 관리자 브라우저 진단/);
  assert.match(smoke, /\.admin-browser-diagnostic/);
});

test('shared admin navigation exposes five domains plus Operations Center with top contextual tabs', async () => {
  const registry = await read('admin-menu-registry.js');
  const sidebar = await read('admin-sidebar.js');
  const postbuild = await read('scripts/admin-performance-postbuild.mjs');
  assert.doesNotMatch(registry, /id: 'overview'/);
  for (const area of ['structure', 'core', 'common', 'vertical', 'tenants', 'operations-center']) assert.match(registry, new RegExp(`id: '${area}'`));
  for (const retired of ['home', 'operations', 'people', 'services', 'ai', 'business', 'data', 'system', 'site-management', 'security-audit', 'settings', 'access', 'space']) assert.doesNotMatch(registry, new RegExp(`id: '${retired}', icon:`));
  assert.match(registry, /id: 'capabilities', group: 'operations-center'/);
  assert.match(registry, /id: 'devices', group: 'operations-center'/);
  assert.match(sidebar, /RETIRED_MENU_SECTIONS = new Set\(\['overview'\]\)/);
  assert.match(sidebar, /admin-global-navs/);
  assert.match(sidebar, /admin-context-tabs-shell/);
  assert.match(sidebar, /admin-context-tabs/);
  assert.match(sidebar, /data-admin-context-section/);
  assert.match(sidebar, /data-admin-capability-shortcut/);
  assert.match(sidebar, /admin-context-source/);
  assert.match(sidebar, /adminMenuGovernance = 'workbench-tabs-v2'/);
  assert.match(sidebar, /observer\.observe\(nav, \{ childList: true, subtree: false \}\)/);
  assert.doesNotMatch(sidebar, /subtree: true/);
  assert.doesNotMatch(sidebar, /ekodi-admin-recent-sections|ekodi-admin-favorite-sections/);
  assert.match(postbuild, /admin-menu-registry\.js/);
  assert.match(postbuild, /admin-sidebar\.js/);
});
test('tax admin subservice reuses the authenticated admin session through an explicit protected handoff', async () => {
  const registry = await read('admin-menu-registry.js');
  const runtime = await read('admin-menu-runtime.js');
  const taxPortal = await read('tax-portal-worker.js');
  assert.match(registry, /id: 'tax'[\s\S]*href: 'https:\/\/tax\.ekodi\.kr\/'[\s\S]*adminHandoff: true/);
  assert.match(runtime, /ADMIN_HANDOFF_ALLOWED_TARGETS = new Set\(\['https:\/\/tax\.ekodi\.kr\/'\]\)/);
  assert.match(runtime, /definition\.adminHandoff === true/);
  assert.match(runtime, /new URLSearchParams\(\{ ekodi_admin_token: currentToken \}\)/);
  assert.match(runtime, /auth\.searchParams\.set\('direct', '1'\)/);
  assert.match(runtime, /window\.location\.assign\(destination\)/);
  assert.doesNotMatch(runtime, /link\.href\s*=\s*[^;]*ekodi_admin_token/);
  assert.match(taxPortal, /ekodi_admin_token/);
  assert.match(taxPortal, /TOKEN='ekodi-auth-token'/);
  assert.match(taxPortal, /sessionStorage\.setItem\(TOKEN,handoff\)/);
  assert.match(taxPortal, /history\.replaceState/);
});

test('AI membership admin presents the Core-first execution policy', async () => {
  const panel = await read('user-ai-tier-panel.js');
  assert.match(panel, /Core 우선 · AI 필요 시 자동 선택/);
  assert.match(panel, /대체 경로 준비됨/);
  assert.doesNotMatch(panel, /개인 API → EKODI → 개인 Web → Core/);
  assert.match(panel, /자동화·백그라운드·관리자·시스템 실행은 소비자 Web 세션에 의존하지 않습니다/);
});

// Release trigger checkpoint: shared-site manifest v8 is validated by the guarded production gate.
