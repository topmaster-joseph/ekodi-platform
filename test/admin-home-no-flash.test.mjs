import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// ADMIN-HOME-NO-FLASH-001 (observed 2026-10-27): after login /admin painted the assist
// welcome ("무엇을 관리하거나 실행할까요?") and then swapped to native EKODI Control.
test('legacy assist never flashes on the verified Control home and is not exposed by a timer', async () => {
  for (const file of ['admin-assist-bootstrap.css', 'admin-assist-dock.css']) {
    const css = await read(file);
    assert.match(css, /body\.admin-command-home:not\(\.admin-control-home\):not\(\.admin-control-home-released\) :is\(\.ekodi-assist,\.ekodi-assist-bootstrap\)\{visibility:hidden!important;pointer-events:none!important;animation:none!important\}/, file);
    assert.doesNotMatch(css, /ekodiHomeHoldRelease|8s forwards/, file);
    // A ready native home never exposes the obsolete dock even when a previous panel opened it.
    assert.match(css, /html body\.admin-control-home\[class\] :is\(\.ekodi-assist,\.ekodi-assist-bootstrap\)\{display:none!important\}/, file);
  }
});

test('canonical home never starts legacy Assist, but non-home navigation can restore it', async () => {
  const bootstrap = await read('admin-assist-bootstrap.js');
  const mount = bootstrap.slice(bootstrap.indexOf('function I(){'));
  assert.match(mount, /if\(R\(\)\)\{N\(\);return\}if\(!q\('#ekodiAssistBootstrap'\)\)/);
  assert.match(bootstrap, /H=\(\)=>R\(\)\?N\(\):\(C\(\),I\(\)\)/);
  assert.match(bootstrap, /S=e=>[\s\S]*?\?N\(\):\(C\(\),I\(\)\)/);
  assert.doesNotMatch(bootstrap, /A\(1\)\.catch\(C\)/);
  assert.match(bootstrap, /q\('#ekodiAssistBootstrap'\)\?\.remove\(\)/);
  assert.match(mount, /A\(0\)\.then\(H\)\.catch\(\(\)=>\{\}\)/);
});

test('native Control and its embedded geometry initialize before first paint', async () => {
  const [shell,html,control] = await Promise.all([
    read('admin-authenticated-shell.js'),read('control.html'),read('control.js'),
  ]);
  const critical=shell.match(/const criticalPostAuthScripts = \[([^\]]+)\]/)?.[1]||'';
  const deferred=shell.match(/const deferredPostAuthScripts = \[([^\]]+)\]/)?.[1]||'';
  assert.match(critical, /admin-control-home\.js/);
  assert.doesNotMatch(deferred, /admin-control-home\.js/);
  assert.ok(shell.indexOf('await loadScript(src)') < shell.indexOf('announceReady();loadDeferredEnhancements()'));
  const script=html.indexOf('<script src="/control.js?v=20261028-external-ai-v1"></script>');
  const stylesheet=html.indexOf('<link rel="stylesheet" href="/control.css?v=20261028-external-ai-v1">');
  const body=html.indexOf('<body>');
  assert.ok(script>0 && stylesheet>script && body>stylesheet, 'embedded detection must precede CSS/HTML paint');
  assert.doesNotMatch(html, /control\.js\?v=20261028-external-ai-v1" defer/);
  assert.match(control, /document\.documentElement\.dataset\.ekodiControlEmbedded='admin'/);
  assert.match(control, /rail\.hidden=true;\s*document\.querySelectorAll\('a\[href="\/admin\/"\]'\)/);
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

