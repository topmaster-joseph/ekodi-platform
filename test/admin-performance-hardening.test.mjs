import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('central admin handoff reveals a safe static shell before background session validation', async () => {
  const handoff = await read('admin-central-handoff.js');
  assert.match(handoff, /ekodi_admin_token/);
  assert.match(handoff, /showApp\(safeSession\.get\(EMAIL_KEY\), '인증 세션 확인 중'\)/);
  assert.match(handoff, /AbortController/);
  assert.match(handoff, /5000/);
  assert.match(handoff, /\/api\/session/);
  assert.match(handoff, /ekodi-session-validated/);
  assert.match(handoff, /new URLSearchParams\(location\.search\)\.has\('perf'\)/);
  assert.match(handoff, /PerformanceObserver/);
  assert.doesNotMatch(handoff, /MutationObserver/);
  assert.doesNotMatch(handoff, /setInterval\(/);
  assert.doesNotMatch(handoff, /paymentKeyStatusPanel|passwordResetForm|installPasswordResetUI/);
});

test('authenticated startup is observer-free and isolates legacy console runtime', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /window\.addEventListener\('ekodi-authenticated', onStateChange\)/);
  assert.doesNotMatch(shell, /new MutationObserver/);
  assert.match(shell, /location\.pathname\.startsWith\('\/legacy'\)/);
  assert.match(shell, /loadStyle\('control-center-ops\.css'\)/);
  assert.match(shell, /loadStyle\('control-center-finance\.css'\)/);
  assert.match(shell, /await loadScript\('control-center\.js'\)/);
  const critical = shell.match(/const criticalPostAuthScripts = \[([\s\S]*?)\];/)?.[1] || '';
  for (const asset of ['compact-control-center.js', 'admin-menu-layout.js', 'admin-demand-loader.js']) assert.match(critical, new RegExp(`['\"]${asset.replaceAll('.', '\\.')}['\"]`));
  for (const asset of ['control-center.js', 'campus-actions.js', 'device-control-admin.js', 'ai-ops-admin.js']) assert.doesNotMatch(critical, new RegExp(`['\"]${asset.replaceAll('.', '\\.')}['\"]`));
});

test('menu routing is event-driven with no persistent mutation observer', async () => {
  const menu = await read('admin-menu-layout.js');
  assert.doesNotMatch(menu, /new MutationObserver/);
  assert.match(menu, /ekodi-nav-changed/);
  assert.match(menu, /ekodi-feature-installed/);
  assert.match(menu, /function reconcileNavigation/);
  assert.doesNotMatch(menu, /setInterval\(/);
});

test('demand loader uses transient observation, staggered idle hydration and lazy finance assets', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /const observer = new MutationObserver/);
  assert.match(loader, /observer\.disconnect\(\)/);
  assert.match(loader, /requestIdleCallback/);
  assert.match(loader, /scheduleStep\(index \+ 1\)/);
  assert.match(loader, /control-center-finance\.css/);
  assert.match(loader, /finance-monitor\.js/);
  assert.match(loader, /author-billing-admin\.js/);
  assert.match(loader, /ekodi-nav-changed/);
  assert.doesNotMatch(loader, /setInterval\(/);
  assert.doesNotMatch(loader, /observer\.observe\(app/);
});

test('postbuild removes old first-path assets, perpetual finance polling and mobile blur', async () => {
  const perf = await read('scripts/admin-performance-postbuild.mjs');
  assert.match(perf, /control-center-ops\\\.css/);
  assert.match(perf, /control-center-finance\\\.css/);
  assert.match(perf, /control-center\\\.js/);
  assert.match(perf, /20260819-e2e-perf-1/);
  assert.match(perf, /first-path JavaScript budget exceeded/);
  assert.match(perf, /Finance monitor still contains perpetual polling/);
  assert.match(perf, /content-visibility:auto/);
  assert.match(perf, /backdrop-filter:none!important/);
});

test('build and check always execute the performance guard', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts.build, /admin-performance-postbuild\.mjs/);
  assert.match(pkg.scripts.check, /admin-performance-postbuild\.mjs/);
});
