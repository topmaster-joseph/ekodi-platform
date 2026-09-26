import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('admin shell is separate from user shell and removes the left brand header',async()=>{
  const [adminShell,adminRuntime,adminRegistry,adminSidebar,adminCompact,adminDesign,userHeader,userLanguage,injector,worker,principles,liveVerifier]=await Promise.all([
    read('shell/admin-ui-shell.js'),
    read('admin-menu-runtime.js'),
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
    read('admin-compact.css'),
    read('admin-design-engine.css'),
    read('shell/user-ui-header.js'),
    read('shell/user-language.js'),
    read('ekodi-shell-injector.js'),
    read('ekodi-shell-worker.js'),
    read('docs/admin-ui-module-principles.md'),
    read('scripts/verify-ekodi-shell-live.mjs')
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
  assert.match(adminShell,/position:sticky!important/);
  assert.match(adminShell,/#pageTitle\{display:block!important/);
  assert.doesNotMatch(adminShell,/ekodi-admin-header-title-hidden\{display:none/);
  assert.match(adminShell,/parentElement\?\.hidden\)node\.parentElement\.hidden=false/);

  assert.equal(adminRuntime.includes('function removeLocaleControl()'),true);
  assert.equal(adminRuntime.includes('function installLocaleControl()'),false);
  assert.equal(adminRuntime.includes('<option value="ko">한국어</option><option value="en">English</option>'),false);

  for (const label of ['플랫폼 전체현황','사이트·브랜드','사용자·관리자·권한','서비스·AI','콘텐츠·행사·소통','운영·배포·장애','설정·보안·감사']) assert.equal(adminRegistry.includes(`ko: '${label}'`),true);
  assert.doesNotMatch(adminRegistry,/사이트구조|핵심서비스|공통서비스|전문서비스|고객사이트\(관리자\)/);
  assert.equal(adminRegistry.includes("{ id: 'community', group: 'content'"),true);
  assert.equal(adminRegistry.includes("{ id: 'books', group: 'content'"),true);
  assert.equal(adminRegistry.includes("{ id: 'devotional', group: 'content'"),true);
  assert.equal(adminSidebar.includes("role-projected-sidebar-v4"),true);
  assert.match(adminSidebar,/nav\[data-ekodi-admin-nav-mode="primary"\] > \.nav\{display:none!important\}/);
  assert.match(adminSidebar,/const closeDrawer = \(\) =>/);
  assert.match(adminSidebar,/menuButton\.addEventListener\('click',toggleDrawer\)/);
  assert.equal(adminSidebar.includes("display:flex!important;align-items:center;gap:8px"),true);
  assert.equal(adminSidebar.includes("renderSidebarDetails(nav, globals, group, displayedSection || section, locale)"),true);
  assert.equal(adminDesign.includes('background:#0b1f36!important'),true);
  assert.equal(adminDesign.includes('background:#f6f8fb!important'),true);
  assert.equal(adminCompact.includes('social-connections'),true);
  assert.match(adminDesign,/flexibleChildrenMinWidthZero|/);

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
  assert.match(liveVerifier,/adminUIShellVersion\)<2/);
  assert.match(liveVerifier,/x-ekodi-admin-ui-shell'\)!=='v2'/);
  assert.match(liveVerifier,/adminUI=v2/);

  assert.match(principles,/관리자 왼쪽 상단 헤더는 삭제가 기본 원칙/);
  assert.match(principles,/User Shell UI/);
  assert.match(principles,/Admin Shell UI/);
  assert.match(principles,/역할별 2단 구조/);
  assert.match(principles,/역할별 좌측 메뉴 고정·최고관리자 필요 시 독립스크롤/);
  assert.match(principles,/플랫폼 전체현황 \/ 사이트·브랜드 \/ 사용자·관리자·권한 \/ 서비스·AI \/ 콘텐츠·행사·소통 \/ 운영·배포·장애 \/ 설정·보안·감사/);
  assert.match(principles,/가독성·직관성 공통 기준/);
});


test('mobile admin shell keeps sidebar off-canvas and workspace full width',async()=>{
  const conversationCss=await read('admin-conversation-workbench.css');
  assert.match(conversationCss,/Mobile admin drawer authority v2/);
  assert.match(conversationCss,/\.app\{[\s\S]*?display:block!important;[\s\S]*?max-width:100vw!important/);
  assert.match(conversationCss,/\.sidebar\{[\s\S]*?position:fixed!important;[\s\S]*?transform:translateX\(-105%\)!important/);
  assert.match(conversationCss,/\.sidebar\.open\{[\s\S]*?transform:translateX\(0\)!important/);
  assert.match(conversationCss,/\.app>main\{[\s\S]*?width:100%!important;[\s\S]*?overflow-x:hidden!important/);
});
