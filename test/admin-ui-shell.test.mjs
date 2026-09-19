import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin shell is separate from user shell and removes the left brand header',async()=>{
  const [adminShell,adminRuntime,userHeader,userLanguage,injector,worker,principles]=await Promise.all([
    read('shell/admin-ui-shell.js'),
    read('admin-menu-runtime.js'),
    read('shell/user-ui-header.js'),
    read('shell/user-language.js'),
    read('ekodi-shell-injector.js'),
    read('ekodi-shell-worker.js'),
    read('docs/admin-ui-module-principles.md')
  ]);

  assert.match(adminShell,/SURFACE='admin'/);
  assert.match(adminShell,/window\.__EKODI_ADMIN_UI_SHELL_BOOTED/);
  assert.match(adminShell,/window\.EKODIAdminUIShell/);
  assert.match(adminShell,/\.side-brand/);
  assert.match(adminShell,/node\.remove\(\)/);
  assert.match(adminShell,/data-ekodi-admin-sidebar-footer/);
  assert.match(adminShell,/ekodiAdminAccountPosition/);
  assert.match(adminShell,/ekodiIndependentScroll/);
  assert.match(adminShell,/data-ekodi-admin-nav-mode=\"primary\"/);
  assert.match(adminShell,/primary-fixed/);
  assert.match(adminShell,/LANGUAGE_CONTROL_SELECTORS/);
  assert.match(adminShell,/removeAdminLanguageControls\(\)/);
  assert.match(adminShell,/data-ekodi-language-control/);
  assert.match(adminShell,/ekodiAdminLanguageControl='disabled'/);

  assert.match(adminRuntime,/function removeLocaleControl\\(\\)/);
  assert.doesNotMatch(adminRuntime,/function installLocaleControl\\(\\)/);
  assert.equal(adminRuntime.includes('<option value="ko">한국어</option><option value="en">English</option>'),false);

  assert.match(userHeader,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.doesNotMatch(userHeader,/USER_SURFACES=new Set\([^)]*'admin'/);
  assert.match(userLanguage,/ekodiShellSurface\|\|'\'\)\.toLowerCase\(\)===\'admin\'/);

  assert.match(injector,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.match(injector,/if\(surface==='admin'\)return ADMIN_BOOT_STYLE/);
  assert.match(injector,/data-ekodi-admin-shell-boot/);
  assert.match(injector,/\.side-brand/);

  assert.match(worker,/adminShellUrl\.pathname='\/admin-ui-shell\.js'/);
  assert.match(worker,/x-ekodi-admin-ui-shell/);
  assert.match(worker,/adminUIShellVersion:1/);

  assert.match(principles,/관리자 왼쪽 상단 헤더는 삭제가 기본 원칙/);
  assert.match(principles,/User Shell UI/);
  assert.match(principles,/Admin Shell UI/);
  assert.match(principles,/2단 내비게이션/);
  assert.match(principles,/좌측 1차 메뉴 고정·무스크롤/);
});
