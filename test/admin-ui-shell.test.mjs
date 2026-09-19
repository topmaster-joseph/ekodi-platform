import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin shell is separate from user shell and removes the left brand header',async()=>{
  const [adminShell,adminRuntime,adminRegistry,adminSidebar,adminCompact,userHeader,userLanguage,injector,worker,principles]=await Promise.all([
    read('shell/admin-ui-shell.js'),
    read('admin-menu-runtime.js'),
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
    read('admin-compact.css'),
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
  assert.equal(adminShell.includes('#ekodiAdminLocaleWrap'),true);
  assert.equal(adminShell.includes('#ekodiAdminLocale'),true);
  assert.equal(adminShell.includes('const VERSION=2'),true);

  assert.equal(adminRuntime.includes('function removeLocaleControl()'),true);
  assert.equal(adminRuntime.includes('function installLocaleControl()'),false);
  assert.equal(adminRuntime.includes('<option value="ko">한국어</option><option value="en">English</option>'),false);

  for (const label of ['홈','운영','조직·고객','서비스','커뮤니티','출판·도서','시스템']) assert.equal(adminRegistry.includes(`ko: '${label}'`),true);
  assert.equal(adminRegistry.includes("{ id: 'community', group: 'community'"),true);
  assert.equal(adminRegistry.includes("{ id: 'books', group: 'publishing'"),true);
  assert.equal(adminRegistry.includes("{ id: 'devotional', group: 'publishing'"),true);
  assert.equal(adminSidebar.includes("primary-sidebar-tabs-v3"),true);
  assert.equal(adminSidebar.includes("display:flex!important;align-items:center;gap:14px"),true);
  assert.equal(adminSidebar.includes("globals.querySelector(`:scope>.${DETAILS_CLASS}`)?.remove()"),true);
  assert.equal(adminCompact.includes('--panel:#fff'),true);
  assert.equal(adminCompact.includes('background:#0b1f36!important'),true);

  assert.match(userHeader,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.doesNotMatch(userHeader,/USER_SURFACES=new Set\([^)]*'admin'/);
  assert.match(userLanguage,/ekodiShellSurface\|\|'\'\)\.toLowerCase\(\)===\'admin\'/);

  assert.match(injector,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.match(injector,/if\(surface==='admin'\)return ADMIN_BOOT_STYLE/);
  assert.match(injector,/data-ekodi-admin-shell-boot/);
  assert.match(injector,/\.side-brand/);

  assert.match(worker,/adminShellUrl\.pathname='\/admin-ui-shell\.js'/);
  assert.match(worker,/x-ekodi-admin-ui-shell/);
  assert.match(worker,/adminUIShellVersion:2/);

  assert.match(principles,/관리자 왼쪽 상단 헤더는 삭제가 기본 원칙/);
  assert.match(principles,/User Shell UI/);
  assert.match(principles,/Admin Shell UI/);
  assert.match(principles,/2단 내비게이션/);
  assert.match(principles,/좌측 1차 메뉴 고정·무스크롤/);
  assert.match(principles,/홈 \/ 운영 \/ 조직·고객 \/ 서비스 \/ 커뮤니티 \/ 출판·도서 \/ 시스템/);
  assert.match(principles,/가독성·직관성 공통 기준/);
});
