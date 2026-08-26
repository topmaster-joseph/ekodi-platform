import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('post-auth startup contains only the minimal shell/navigation/demand loader', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /const postAuthStyles = \['compact-control-center\.css'\]/);
  assert.match(shell, /'compact-control-center\.js'/);
  assert.match(shell, /'admin-menu-layout\.js'/);
  assert.match(shell, /'admin-demand-loader\.js'/);
  assert.match(shell, /__EKODI_ADMIN_ASSET_VERSION__/);
  assert.match(shell, /assetUrl\(src\)/);
  assert.doesNotMatch(shell, /'campus-actions\.js'/);
  assert.doesNotMatch(shell, /'campus-actions\.css'/);
  assert.doesNotMatch(shell, /'control-center-features\.js'/);
  assert.doesNotMatch(shell, /'device-control-admin\.js'/);
  assert.doesNotMatch(shell, /'system-health-admin\.js'/);
});

test('authenticated ADMIN UI declares the official stable Core surface and tokens', async () => {
  const shell = await read('admin-authenticated-shell.js');
  assert.match(shell, /function applyOfficialAdminSurface\(\)/);
  assert.match(shell, /root\.dataset\.ekodiShellSurface = 'admin'/);
  assert.match(shell, /root\.dataset\.ekodiAdminUi = 'official'/);
  assert.match(shell, /'--ekodi-ui-bg': '#071522'/);
  assert.match(shell, /'--ekodi-ui-surface': '#0B1D2E'/);
  assert.match(shell, /'--ekodi-ui-border': '#24425E'/);
  assert.match(shell, /'--ekodi-ui-text': '#F4F7FB'/);
  assert.match(shell, /'--ekodi-ui-accent': '#8EC8FF'/);
  assert.match(shell, /applyOfficialAdminSurface\(\);/);
});

test('Campus, Health and Device Control are explicit versioned demand-loaded features', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /__EKODI_ADMIN_ASSET_VERSION__/);
  assert.match(loader, /campus:\s*\{/);
  assert.match(loader, /styles: \['campus-actions\.css'\]/);
  assert.match(loader, /scripts: \['campus-actions\.js'\]/);
  assert.match(loader, /health:\s*\{/);
  assert.match(loader, /label: 'Health'/);
  assert.match(loader, /styles: \['system-health-admin\.css'\]/);
  assert.match(loader, /scripts: \['system-health-admin\.js'\]/);
  assert.match(loader, /hashes: \['#health'\]/);
  assert.match(loader, /insert: 'after-aiops'/);
  assert.match(loader, /devices:\s*\{/);
  assert.match(loader, /styles: \['device-control-admin\.css'\]/);
  assert.match(loader, /scripts: \['device-control-admin\.js'\]/);
  assert.match(loader, /hashes: \['#devices'\]/);
  assert.match(loader, /assetUrl\(src\)/);
  const aiOps = loader.match(/aiops:\s*\{([\s\S]*?)\n\s*\},\n\s*health:/)?.[1] || '';
  assert.ok(aiOps, 'AI Ops feature block must be extractable');
  assert.doesNotMatch(aiOps, /system-health-admin/);
});

test('standalone Health creates its own menu and fetches only on activation', async () => {
  const health = await read('system-health-admin.js');
  assert.match(health, /const SECTION = 'health'/);
  assert.match(health, /button\.dataset\.section = SECTION/);
  assert.match(health, /navLabel\.textContent = 'Health'/);
  assert.match(health, /section\.dataset\.panel = SECTION/);
  assert.match(health, /pageTitle\.textContent = 'System Health'/);
  assert.match(health, /if \(location\.hash !== '#health'\)/);
  assert.match(health, /button\.addEventListener\('click', activate\)/);
  assert.match(health, /load\(false\)/);
  assert.doesNotMatch(health, /IntersectionObserver/);
  assert.doesNotMatch(health, /setInterval\(/);
});

test('secondary hydration never has a forced requestIdleCallback deadline', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /navigator\.scheduling\?\.isInputPending/);
  assert.match(loader, /scheduler\?\.postTask/);
  assert.match(loader, /priority:'background'/);
  assert.match(loader, /requestIdleCallback\(callback\)/);
  assert.doesNotMatch(loader, /requestIdleCallback\(callback, \{ timeout/);
  assert.match(loader, /timeRemaining\(\) < 6/);
});

test('admin menu does not auto-open heavy workspaces on a normal login', async () => {
  const menu = await read('admin-menu-layout.js');
  const registry = await read('admin-menu-registry.js');
  assert.match(menu, /let requestedSection = ''/);
  assert.match(menu, /const initialHash = explicitHashSection\(\)/);
  assert.match(menu, /else if \(initialHash\) requestedSection = initialHash/);
  assert.match(menu, /requestedSection = 'overview';[\s\S]*activatePanel\('overview'\)/);
  assert.ok(registry.indexOf("id: 'campus'") < registry.indexOf("id: 'aiops'"));
  assert.ok(registry.indexOf("id: 'aiops'") < registry.indexOf("id: 'health'"));
  assert.match(menu, /\['#health', 'health'\]/);
  assert.doesNotMatch(menu, /requestedSection = 'aiops';\s*\n\s*preferAiOpsOnReady = true/);
  assert.doesNotMatch(menu, /setInterval\(/);
});

test('postbuild emits a purpose-built minimal compact runtime and standalone Campus/Device assets', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const postbuild = await read('scripts/admin-thin-postbuild.mjs');
  assert.match(pkg.scripts.build, /admin-thin-postbuild\.mjs/);
  assert.match(postbuild, /const minimalCompactJs =/);
  assert.match(postbuild, /writeFile\(`\$\{dist\}compact-control-center\.js`, minimalCompactJs\)/);
  assert.match(postbuild, /writeFile\(`\$\{dist\}device-control-admin\.js`/);
  assert.match(postbuild, /writeFile\(`\$\{dist\}device-control-admin\.css`/);
  assert.match(postbuild, /Startup compact JS contains historical runtime/);
  assert.match(postbuild, /section\.id = 'campusPanel'/);
  assert.match(postbuild, /compact-control-center\.js admin-menu-layout\.js admin-demand-loader\.js/);
  const generated = postbuild.match(/const minimalCompactJs = `([\s\S]*?)`;\nnew Function\(minimalCompactJs\)/)?.[1] || '';
  assert.ok(generated, 'minimal compact runtime template must be extractable');
  assert.doesNotMatch(generated, /setTimeout\(/);
  assert.doesNotMatch(generated, /installCampus|installPolicies|WINDOWS_AGENT_URL|ekodiDevicePanel/);
});
