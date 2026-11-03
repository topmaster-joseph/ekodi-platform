import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// ADMIN-HOME-NO-FLASH-001 (observed 2026-10-27): after login /admin painted the assist
// welcome ("무엇을 관리하거나 실행할까요?") and then swapped to native EKODI Control.
test('the assist surfaces stay transparent on the home until Control decides, with a timed release', async () => {
  for (const file of ['admin-assist-bootstrap.css', 'admin-assist-dock.css']) {
    const css = await read(file);
    assert.match(css, /body\.admin-command-home:not\(\.admin-control-home\):not\(\.admin-control-home-released\) :is\(\.ekodi-assist,\.ekodi-assist-bootstrap\)\{opacity:0;pointer-events:none;animation:ekodiHomeHoldRelease 0s 8s forwards\}/, file);
    assert.match(css, /@keyframes ekodiHomeHoldRelease\{to\{opacity:1;pointer-events:auto\}\}/, `${file}: the hold can never stick`);
    // Must outrank `html body.admin-command-home .ekodi-assist-bootstrap{display:flex!important}`.
    assert.match(css, /html body\.admin-control-home\[class\] :is\(\.ekodi-assist,\.ekodi-assist-bootstrap\)\{display:none!important\}/, file);
  }
});

test('a dock restored open marks the home before its saved state applies (observed 2026-10-28)', async () => {
  const dock = await read('admin-assist-dock.js');
  const install = dock.slice(dock.indexOf('function install(){'));
  assert.ok(install.indexOf("if(onAdminHome())document.body.classList.add('admin-command-home');") < install.indexOf('setOpen(Boolean(state.open),false)'));
  assert.match(dock, /function onAdminHome\(\)\{const routed=window\.EKODIAdminRoutes\?\.sectionFromLocation\?\.\(location\);if\(routed\)return routed==='command-home';/);
});


test('Control home releases the hold for non-super-admin sessions and other sections', async () => {
  const home = await read('admin-control-home.js');
  assert.match(home, /document\.body\.classList\.toggle\('admin-control-home-released',!isSuperAdmin\(\)&&!pendingVerification\(\)\);/);
  assert.match(home, /verifying=Boolean\(token&&app&&!app\.hidden\);/);
  assert.match(home, /if\(requestId===verificationId\)verifying=false;/);
  assert.ok(home.indexOf('let verifying=false;') < home.indexOf('function sync()'), 'flag is declared before first use');
  // The thin first-path shell is untouched by this fix.
  const shell = await read('admin-authenticated-shell.js');
  assert.doesNotMatch(shell, /admin-control-home-pending/);
});

