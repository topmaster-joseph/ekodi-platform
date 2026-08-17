import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const shell = await readFile(`${root}admin-authenticated-shell.js`, 'utf8');
const build = await readFile(`${root}scripts/build.mjs`, 'utf8');

function scriptTag(name) {
  return `<script src="${name}"`;
}

test('pre-auth admin HTML uses only the authenticated shell loader', () => {
  assert.match(build, /admin-authenticated-shell\.js\?v=20260816-preauth-1/);
  assert.match(build, /data-ekodi-postauth="compact-control-center\.js control-center-features\.js campus-actions\.js admin-lazy-features\.js/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="compact-control-center\.js"/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="campus-actions\.js"/);
  assert.doesNotMatch(build, /html = html\.replace\('<\/body>', '<script src="admin-lazy-features\.js"/);
});

test('post-auth loader refuses to start Campus before a validated session reveals app', () => {
  assert.match(shell, /return Boolean\(token\(\) && app && !app\.hidden\)/);
  const guard = shell.indexOf('if (started || !authenticated()) return');
  const criticalLoad = shell.indexOf('await Promise.all(criticalPostAuthScripts.map(loadScript))');
  assert.ok(guard >= 0, 'authenticated shell guard must exist');
  assert.ok(criticalLoad > guard, 'critical post-auth scripts must load only after the authenticated app is visible');
  assert.match(shell, /observer\.observe\(app, \{ attributes:true, attributeFilter:\['hidden'\] \}\)/);
  assert.equal(shell.includes('history.replaceState'), false, 'post-auth loader must never create a navigation hash before authentication');
});

test('minimal login shell keeps the central auth link interactive while app is hidden', () => {
  assert.match(shell, /loginLink\.style\.pointerEvents = 'auto'/);
  assert.match(shell, /loginScreen\.style\.pointerEvents = 'auto'/);
  assert.match(shell, /loginScreen\.style\.zIndex = '1000'/);
  assert.equal(scriptTag('compact-control-center.js'), '<script src="compact-control-center.js"');
});

test('authenticated critical features have a deterministic membership and load in parallel', () => {
  for (const asset of [
    'compact-control-center.js',
    'control-center-features.js',
    'campus-actions.js',
    'ai-ops-admin.js',
    'admin-menu-layout.js',
  ]) {
    assert.match(shell, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));
  }
  assert.match(shell, /const deferredPostAuthScripts = \['admin-lazy-features\.js'\]/);
  assert.match(shell, /await Promise\.all\(criticalPostAuthScripts\.map\(loadScript\)\)/);
  assert.doesNotMatch(shell, /for \(const src of postAuthScripts\) await loadScript\(src\)/);
});

test('Mall Free Ops is hard-isolated to its own admin section and unloaded elsewhere', () => {
  assert.match(shell, /function deactivateMallFreeOps\(\)/);
  assert.match(shell, /panel\.hidden = true/);
  assert.match(shell, /panel\.classList\.add\('hidden-panel'\)/);
  assert.match(shell, /frame\.removeAttribute\('src'\)/);
  assert.match(shell, /item\.dataset\.adminLink === 'mall-free-ops'/);
  assert.match(shell, /if \(panel\?\.hidden\) panel\.hidden = false/);
  assert.match(shell, /if \(location\.hash !== '#mall-free-ops'\) deactivateMallFreeOps\(\)/);
  assert.match(shell, /installMallFreeOpsIsolation\(\)/);
});
