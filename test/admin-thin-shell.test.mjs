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
  assert.doesNotMatch(shell, /'campus-actions\.js'/);
  assert.doesNotMatch(shell, /'campus-actions\.css'/);
  assert.doesNotMatch(shell, /'control-center-features\.js'/);
  assert.doesNotMatch(shell, /'device-control-admin\.js'/);
});

test('Campus and Device Control are explicit demand-loaded features', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /campus:\s*\{/);
  assert.match(loader, /styles: \['campus-actions\.css'\]/);
  assert.match(loader, /scripts: \['campus-actions\.js'\]/);
  assert.match(loader, /devices:\s*\{/);
  assert.match(loader, /styles: \['device-control-admin\.css'\]/);
  assert.match(loader, /scripts: \['device-control-admin\.js'\]/);
  assert.match(loader, /hashes: \['#devices'\]/);
});

test('admin menu does not auto-open heavy workspaces on a normal login', async () => {
  const menu = await read('admin-menu-layout.js');
  assert.match(menu, /No hash: deliberately keep the already-rendered lightweight overview shell/);
  assert.doesNotMatch(menu, /requestedSection = 'aiops';\s*\n\s*preferAiOpsOnReady = true/);
  assert.doesNotMatch(menu, /window\.setTimeout\(\(\) => applyExclusivePanel\(\), 40\)/);
  assert.doesNotMatch(menu, /window\.setTimeout\(\(\) => applyExclusivePanel\(\), 180\)/);
});

test('build postprocess removes Campus and Device code from compact assets and materializes standalone Device assets', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const postbuild = await read('scripts/admin-thin-postbuild.mjs');
  assert.match(pkg.scripts.build, /admin-thin-postbuild\.mjs/);
  assert.match(postbuild, /writeFile\(`\$\{dist\}device-control-admin\.js`/);
  assert.match(postbuild, /writeFile\(`\$\{dist\}device-control-admin\.css`/);
  assert.match(postbuild, /Standalone Device Control JavaScript was not materialized/);
  assert.match(postbuild, /Standalone Device Control CSS was not materialized/);
  assert.match(postbuild, /Device Control leaked into compact-control-center\.js/);
  assert.match(postbuild, /Campus constructor leaked into compact-control-center\.js/);
  assert.match(postbuild, /section\.id = 'campusPanel'/);
  assert.match(postbuild, /compact-control-center\.js admin-menu-layout\.js admin-demand-loader\.js/);
});
