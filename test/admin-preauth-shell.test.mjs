import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const shell = await readFile(`${root}admin-authenticated-shell.js`, 'utf8');
const build = await readFile(`${root}scripts/build.mjs`, 'utf8');
const postbuild = await readFile(`${root}scripts/admin-thin-postbuild.mjs`, 'utf8');
const performancePostbuild = await readFile(`${root}scripts/admin-performance-postbuild.mjs`, 'utf8');

function scriptTag(name) {
  return `<script src="${name}"`;
}

test('pre-auth admin HTML uses only the authenticated shell loader and generated metadata is thinned after build', () => {
  assert.match(build, /admin-authenticated-shell\.js\?v=20260819-true-lazy-1/);
  assert.match(postbuild, /20260819-thin-shell-2/);
  assert.match(performancePostbuild, /20260819-e2e-perf-1/);
  assert.match(postbuild, /compact-control-center\.js admin-menu-layout\.js admin-demand-loader\.js/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="compact-control-center\.js"/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="campus-actions\.js"/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="admin-lazy-features\.js"/);
});

test('post-auth loader starts only when the authenticated app is visible and uses auth events instead of a persistent observer', () => {
  assert.match(shell, /return Boolean\(token\(\) && app && !app\.hidden\)/);
  const guard = shell.indexOf('if (started || !authenticated()) return');
  const criticalLoad = shell.indexOf('await Promise.all(criticalPostAuthScripts.map(loadScript))');
  assert.ok(guard >= 0, 'authenticated shell guard must exist');
  assert.ok(criticalLoad > guard, 'critical post-auth scripts must load only after the authenticated app is visible');
  assert.match(shell, /window\.addEventListener\('ekodi-authenticated', onStateChange\)/);
  assert.doesNotMatch(shell, /new MutationObserver/);
  assert.equal(shell.includes('history.replaceState'), false, 'post-auth loader must never create a navigation hash before authentication');
});

test('minimal login shell keeps the central auth link interactive while app is hidden', () => {
  assert.match(shell, /loginLink\.style\.pointerEvents = 'auto'/);
  assert.match(shell, /loginScreen\.style\.pointerEvents = 'auto'/);
  assert.match(shell, /loginScreen\.style\.zIndex = '1000'/);
  assert.equal(scriptTag('compact-control-center.js'), '<script src="compact-control-center.js"');
});

test('authenticated normal route contains only the three thin shell modules and legacy runtime is route isolated', () => {
  for (const asset of [
    'compact-control-center.js',
    'admin-menu-layout.js',
    'admin-demand-loader.js',
  ]) assert.match(shell, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));

  for (const noncritical of [
    'control-center-features.js',
    'campus-actions.js',
    'device-control-admin.js',
    'ai-ops-admin.js',
    'admin-lazy-features.js',
    'release-control-admin.js',
    'work-admin.js',
    'marketing-ai-admin.js',
  ]) assert.doesNotMatch(shell, new RegExp(`'${noncritical.replaceAll('.', '\\.')}'`));

  assert.match(shell, /location\.pathname\.startsWith\('\/legacy'\)/);
  assert.match(shell, /await loadScript\('control-center\.js'\)/);
  assert.match(shell, /await Promise\.all\(criticalPostAuthScripts\.map\(loadScript\)\)/);
  assert.doesNotMatch(shell, /deferredPostAuthScripts|scheduleDeferredFeatures/);
});

test('Mall Free Ops is event-isolated without a document-wide mutation observer', () => {
  assert.match(shell, /function deactivateMallFreeOps\(\)/);
  assert.match(shell, /panel\.hidden = true/);
  assert.match(shell, /panel\.classList\.add\('hidden-panel'\)/);
  assert.match(shell, /frame\.removeAttribute\('src'\)/);
  assert.match(shell, /item\.dataset\.adminLink === 'mall-free-ops'/);
  assert.match(shell, /if \(panel\?\.hidden\) panel\.hidden = false/);
  assert.match(shell, /if \(location\.hash !== '#mall-free-ops'\) deactivateMallFreeOps\(\)/);
  assert.match(shell, /installMallFreeOpsIsolation\(\)/);
  assert.doesNotMatch(shell, /observer\.observe\(content, \{ childList:true, subtree:true/);
});
