import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin shell is separate from user shell and removes the left brand header',async()=>{
  const [adminShell,userHeader,injector,worker,legacyAdmin,principles]=await Promise.all([
    read('shell/admin-ui-shell.js'),
    read('shell/user-ui-header.js'),
    read('ekodi-shell-injector.js'),
    read('ekodi-shell-worker.js'),
    read('admin-authenticated-shell.js'),
    read('docs/admin-ui-module-principles.md')
  ]);

  assert.match(adminShell,/SURFACE='admin'/);
  assert.match(adminShell,/window\.__EKODI_ADMIN_UI_SHELL_BOOTED/);
  assert.match(adminShell,/window\.EKODIAdminUIShell/);
  assert.match(adminShell,/\.side-brand/);
  assert.match(adminShell,/node\.remove\(\)/);
  assert.match(adminShell,/data-ekodi-admin-sidebar-footer/);
  assert.match(adminShell,/data-ekodiAdminAccountPosition|ekodiAdminAccountPosition/);
  assert.match(adminShell,/ekodiIndependentScroll/);

  assert.match(userHeader,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.doesNotMatch(userHeader,/USER_SURFACES=new Set\([^)]*'admin'/);

  assert.match(injector,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.match(injector,/if\(surface==='admin'\)return ADMIN_BOOT_STYLE/);
  assert.match(injector,/data-ekodi-admin-shell-boot/);
  assert.match(injector,/\.side-brand/);

  assert.match(worker,/adminShellUrl\.pathname='\/admin-ui-shell\.js'/);
  assert.match(worker,/x-ekodi-admin-ui-shell/);
  assert.match(worker,/adminUIShellVersion:1/);

  assert.match(legacyAdmin,/if \(window\.__EKODI_ADMIN_UI_SHELL_BOOTED\) return/);
  assert.match(legacyAdmin,/removeSidebarHeader\(sidebar\)/);
  assert.match(legacyAdmin,/\.side-brand/);

  assert.match(principles,/관리자 왼쪽 상단 헤더는 삭제가 기본 원칙/);
  assert.match(principles,/User Shell UI/);
  assert.match(principles,/Admin Shell UI/);
});
