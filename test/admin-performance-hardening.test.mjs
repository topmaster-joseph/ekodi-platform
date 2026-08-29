import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('central admin handoff reveals a safe static shell once and validates session in background', async () => {
  const handoff = await read('admin-central-handoff.js');
  assert.match(handoff, /ekodi_admin_token/);
  assert.match(handoff, /const becameVisible = app\.hidden/);
  assert.match(handoff, /if \(!becameVisible\) return/);
  assert.match(handoff, /showApp\(safeSession\.get\(EMAIL_KEY\), '인증 세션 확인 중'\)/);
  assert.match(handoff, /updateSessionState\(result\.email/);
  assert.match(handoff, /AbortController/);
  assert.match(handoff, /\/api\/session/);
  assert.match(handoff, /ekodi-session-validated/);
  assert.match(handoff, /admin-perf-diagnostics\.js/);
  assert.match(handoff, /new URLSearchParams\(location\.search\)\.has\('perf'\)/);
  assert.doesNotMatch(handoff, /PerformanceObserver/);
  assert.doesNotMatch(handoff, /MutationObserver/);
  assert.doesNotMatch(handoff, /setInterval\(/);
  assert.doesNotMatch(handoff, /paymentKeyStatusPanel|passwordResetForm|installPasswordResetUI/);
});

test('detailed diagnostics are standalone and only observe when explicitly loaded', async () => {
  const diagnostics = await read('admin-perf-diagnostics.js');
  assert.match(diagnostics, /PerformanceObserver/);
  assert.match(diagnostics, /longtask/);
  assert.match(diagnostics, /layout-shift/);
  assert.match(diagnostics, /durationThreshold:16/);
  assert.match(diagnostics, /window\.EKODIAdminPerf/);
  assert.doesNotMatch(diagnostics, /fetch\(/);
  assert.doesNotMatch(diagnostics, /setInterval\(/);
});

test('authenticated startup is observer-free, preserves the requested route and loads only navigation-critical scripts', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /window\.addEventListener\('ekodi-authenticated',\s*onStateChange\)/);
  assert.doesNotMatch(shell, /new MutationObserver/);
  assert.doesNotMatch(shell, /function canonicalizeLegacyEntry\(\)/);
  assert.match(shell, /const requestedHash=location\.hash/);
  assert.match(shell, /if\(requestedHash&&location\.hash!==requestedHash\)history\.replaceState/);
  assert.doesNotMatch(shell, /location\.pathname\.startsWith\('\/legacy'\)/);
  assert.doesNotMatch(shell, /loadStyle\('control-center-ops\.css'\)/);
  assert.doesNotMatch(shell, /loadStyle\('control-center-finance\.css'\)/);
  assert.doesNotMatch(shell, /loadScript\('control-center\.js'\)/);
  assert.match(shell, /__EKODI_ADMIN_ASSET_VERSION__/);
  const critical = shell.match(/const criticalPostAuthScripts\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  const deferred = shell.match(/const deferredPostAuthScripts\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  for (const asset of ['admin-menu-layout.js', 'admin-demand-loader.js']) assert.match(critical, new RegExp(`['\"]${asset.replaceAll('.', '\\.')}['\"]`));
  for (const asset of ['compact-control-center.js', 'google-admin-auth.js', 'ekodi-message-ui.js', 'control-center.js', 'campus-actions.js', 'device-control-admin.js', 'ai-ops-admin.js']) assert.doesNotMatch(critical, new RegExp(`['\"]${asset.replaceAll('.', '\\.')}['\"]`));
  for (const asset of ['google-admin-auth.js', 'ekodi-message-ui.js']) assert.match(deferred, new RegExp(`['\"]${asset.replaceAll('.', '\\.')}['\"]`));
  assert.match(shell, /announceReady\(\);loadDeferredEnhancements\(\)/);
});

test('menu routing is event-driven with no persistent mutation observer', async () => {
  const menu = await read('admin-menu-layout.js');
  assert.doesNotMatch(menu, /new MutationObserver/);
  assert.match(menu, /ekodi-nav-changed/);
  assert.match(menu, /ekodi-feature-installed/);
  assert.match(menu, /function reconcileNavigation/);
  assert.doesNotMatch(menu, /setInterval\(/);
});

test('demand loader uses transient observation, background priority and input-aware secondary hydration', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /const observer = new MutationObserver/);
  assert.match(loader, /observer\.disconnect\(\)/);
  assert.match(loader, /scheduler\?\.postTask/);
  assert.match(loader, /priority:'background'/);
  assert.match(loader, /navigator\.scheduling\?\.isInputPending/);
  assert.match(loader, /requestIdleCallback\(callback\)/);
  assert.doesNotMatch(loader, /requestIdleCallback\(callback, \{ timeout/);
  assert.match(loader, /control-center-finance\.css/);
  assert.match(loader, /finance-monitor\.js/);
  assert.match(loader, /author-billing-admin\.js/);
  assert.match(loader, /ekodi-nav-changed/);
  assert.doesNotMatch(loader, /setInterval\(/);
  assert.doesNotMatch(loader, /observer\.observe\(app/);
});

test('postbuild removes old first-path assets, versions the final graph and enforces final JS/CSS budgets', async () => {
  const perf = await read('scripts/admin-performance-postbuild.mjs');
  assert.match(perf, /control-center-ops\\\.css/);
  assert.match(perf, /control-center-finance\\\.css/);
  assert.match(perf, /control-center\\\.js/);
  assert.match(perf, /createHash\('sha256'\)/);
  assert.match(perf, /assetVersion/);
  assert.match(perf, /moduleImportVersions/);
  assert.match(perf, /admin-menu-registry\.js/);
  assert.match(perf, /admin-sidebar\.js/);
  assert.match(perf, /admin-menu-runtime\.js/);
  assert.match(perf, /first-path JavaScript budget exceeded/);
  assert.match(perf, /first-path CSS budget exceeded/);
  assert.match(perf, /AI command CSS leaked into startup compact CSS/);
  assert.match(perf, /Finance monitor still contains perpetual polling/);
  assert.match(perf, /content-visibility:auto/);
  assert.match(perf, /backdrop-filter:none!important/);
  assert.match(perf, /admin mobile flow/);
  assert.match(perf, /position:static!important/);
  assert.match(perf, /\.app>main\{padding-top:0!important\}/);
  assert.match(perf, /\.topbar \.kicker\{display:none!important\}/);
});

test('admin readability is first-path without consuming the compact CSS budget, while AI command styling stays lazy', async () => {
  const readable = await read('scripts/admin-readable-command-postbuild.mjs');
  assert.match(readable, /admin-readability-base\.css/);
  assert.match(readable, /appendFile\(`\$\{output\}control-center\.css`/);
  assert.doesNotMatch(readable, /appendFile\(`\$\{output\}compact-control-center\.css`/);
  assert.match(readable, /appendFile\(`\$\{output\}ai-ops-admin\.css`/);
  assert.match(readable, /admin-readable-command\.css/);
});

test('versioned admin assets receive immutable cache headers while unversioned requests revalidate', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /function adminAssetCacheControl\(url\)/);
  assert.match(worker, /url\.searchParams\.has\('v'\)/);
  assert.match(worker, /max-age=31536000, immutable/);
  assert.match(worker, /max-age=0, must-revalidate/);
  assert.match(worker, /admin-perf-diagnostics\.js/);
});

test('shared admin menu modules use the secured immutable admin asset route', async () => {
  const [worker, wrangler] = await Promise.all([read('site-worker.js'), read('wrangler.site.toml')]);
  for (const asset of ['admin-menu-registry.js', 'admin-sidebar.js', 'admin-menu-runtime.js']) {
    assert.match(worker, new RegExp(`/${asset.replaceAll('.', '\\.')}`));
    assert.match(wrangler, new RegExp(`/${asset.replaceAll('.', '\\.')}`));
  }
});

test('versioned admin startup graph runs Worker-first so cache policy is not bypassed by static asset headers', async () => {
  const wrangler = await read('wrangler.site.toml');
  for (const asset of [
    '/control-center.css',
    '/admin-central-handoff.js',
    '/admin-authenticated-shell.js',
    '/compact-control-center.js',
    '/compact-control-center.css',
    '/admin-menu-layout.js',
    '/admin-menu-registry.js',
    '/admin-sidebar.js',
    '/admin-menu-runtime.js',
    '/admin-demand-loader.js',
    '/admin-perf-diagnostics.js',
    '/admin-lazy-features.js',
    '/ai-ops-admin.css',
    '/system-health-admin.js',
    '/system-health-admin.css',
  ]) assert.match(wrangler, new RegExp(asset.replaceAll('.', '\\.').replaceAll('/', '\\/')));
});

test('build ordering runs readable layer before the final performance guard', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const build = pkg.scripts.build;
  const readableIndex = build.indexOf('admin-readable-command-postbuild.mjs');
  const perfIndex = build.indexOf('admin-performance-postbuild.mjs');
  assert.ok(readableIndex >= 0 && perfIndex > readableIndex, 'performance postbuild must run after every startup-affecting postbuild');
  assert.match(pkg.scripts.check, /admin-performance-postbuild\.mjs/);
});
