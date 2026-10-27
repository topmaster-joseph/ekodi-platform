import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// ADMIN-HOME-NO-FLASH-001 (observed 2026-10-27): after login /admin painted the assist
// welcome ("무엇을 관리하거나 실행할까요?") and then swapped to native EKODI Control.
test('the assist command view is held on the home until Control decides, with a timed release', async () => {
  const css = await read('admin-assist-bootstrap.css');
  assert.match(css, /body\.admin-command-home:not\(\.admin-control-home\):not\(\.admin-control-home-released\) :is\(\.ekodi-assist,\.ekodi-assist-bootstrap\)\{visibility:hidden;animation:ekodiHomeHoldRelease 0s 8s forwards\}/);
  assert.match(css, /@keyframes ekodiHomeHoldRelease\{to\{visibility:visible\}\}/, 'the hold can never stick');
});

test('Control home releases the hold for non-super-admin sessions and other sections', async () => {
  const home = await read('admin-control-home.js');
  assert.match(home, /document\.body\.classList\.toggle\('admin-control-home-released',!atHome&&!pendingVerification\(\)\);/);
  assert.match(home, /verifying=Boolean\(token&&app&&!app\.hidden\);/);
  assert.match(home, /if\(requestId===verificationId\)verifying=false;/);
  assert.ok(home.indexOf('let verifying=false;') < home.indexOf('function sync()'), 'flag is declared before first use');
  // The thin first-path shell is untouched by this fix.
  const shell = await read('admin-authenticated-shell.js');
  assert.doesNotMatch(shell, /admin-control-home-pending/);
});
