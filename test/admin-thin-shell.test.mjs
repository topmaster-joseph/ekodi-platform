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
});

test('Campus and Device Control are explicit versioned demand-loaded features', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /__EKODI_ADMIN_ASSET_VERSION__/);
  assert.match(loader, /campus:\s*\{/);
  assert.match(loader, /styles: \['campus-actions\.css'\]/);
  assert.match(loader, /scripts: \['campus-actions\.js'\]/);
  assert.match(loader, /devices:\s*\{/);
  assert.match(loader, /styles: \['device-control-admin\.css'\]/);
  assert.match(loader, /scripts: \['device-control-admin\.js'\]/);
  assert.match(loader, /hashes: \['#devices'\]/);
  assert.match(loader, /assetUrl\(src\)/);
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
  assert.match(menu, /let requestedSection = ''/);
  assert.match(menu, /const initialHash = explicitHashSection\(\)/);
  assert.match(menu, /else if \(initialHash\) requestedSection = initialHash/);
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
  assert.doesNotMatch(postbuild, /minimalCompactJs[\s\S]*setTimeout\(/);
});
