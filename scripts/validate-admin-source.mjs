import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const retiredFiles = [
  'admin.html',
  'control-center.js',
  'control-center-features.js',
  'control-center-ops.css',
  'control-center.html',
  'control-center.css',
  'control-center-finance.css',
  'compact-control-center.css',
];
const forbiddenCompatibility = [
  '/legacy#domains',
  '/legacy#activity',
  'EKODI Platform Operations',
  'OPERATIONS OVERVIEW',
  "overview:'operations'",
  "legacy:'ai-ops'",
  "domains:'ai-ops'",
  "activity:'ai-ops'",
  "location.pathname.startsWith('/legacy')",
];
const allowedExtensions = new Set(['.js','.mjs','.html','.css','.json','.yml','.yaml','.md']);
const ignored = new Set(['.git','node_modules','dist','.wrangler']);
const violations = [];

for (const file of retiredFiles) {
  if (existsSync(join(root, file))) violations.push(`retired source still exists: ${file}`);
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes:true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) { walk(absolute); continue; }
    if (!entry.isFile() || !allowedExtensions.has(extname(entry.name))) continue;
    const rel = relative(root, absolute).replaceAll('\\','/');
    if (rel === 'scripts/validate-admin-source.mjs') continue;
    const source = readFileSync(absolute, 'utf8');
    for (const marker of forbiddenCompatibility) {
      if (source.includes(marker)) violations.push(`${rel}: retired admin compatibility marker: ${marker}`);
    }
  }
}
walk(root);

const worker = readFileSync(join(root, 'site-worker.js'), 'utf8');
for (const path of ['/admin.html','/control-center','/control-center/','/control-center.html','/legacy','/legacy/','/legacy.html','/control-center.js','/control-center-features.js','/control-center-ops.css']) {
  if (!worker.includes(`'${path}'`)) violations.push(`site-worker.js: retired path missing from explicit 404 contract: ${path}`);
}
if (!worker.includes('RETIRED_ADMIN_PATHS.has(url.pathname)')) violations.push('site-worker.js: retired admin 404 gate missing');

const adminPrinciples = readFileSync(join(root, 'ADMIN_UI_PRINCIPLES.md'), 'utf8');
for (const marker of ['공개 사이트의 고정 헤더용 body 상단 여백', '좌측 전역 사이드바는 데스크톱에서 뷰포트에 고정', '최고관리자 좌측 사이드바는 선택 영역의 핵심 직접업무가 잘리지 않도록 필요 시 독립 세로 스크롤을 허용한다', '로그인 1회 · 권한은 조용히 확인 · 외부 OAuth는 최초 연결/복구 시만', '이미 `active`인 외부 채널 계정은 관리자 로그인 후 저장된 중앙 Vault 연결을 재사용', 'ADMIN-MOBILE-SHELL-003', '홈 · 사이트 · 서비스 · 운영 · 더보기']) {
  if (!adminPrinciples.includes(marker)) violations.push(`ADMIN_UI_PRINCIPLES.md: missing admin viewport contract marker: ${marker}`);
}
const workspaceAdmin = readFileSync(join(root, 'workspace-admin-page.js'), 'utf8');
for (const marker of [
  'ADMIN_SSO_RECOVERY_KEY',
  'beginWorkspaceSsoRecovery()',
  "account.status==='active'?`<span class='tag live'>연결 유지</span>`",
  '추가 OAuth 승인 없이 관리자 로그인으로 계속 사용합니다',
  "['reconnect_required','revoked','error'].includes"
]) {
  if (!workspaceAdmin.includes(marker)) violations.push(`workspace-admin-page.js: missing single-login/OAuth reuse marker: ${marker}`);
}
if (workspaceAdmin.includes("account.status==='active'?'재인증'")) {
  violations.push('workspace-admin-page.js: active channel must not expose repeat OAuth reauthentication');
}
const mobileWorkbench = readFileSync(join(root, 'admin-conversation-workbench.css'), 'utf8');
const mobileSidebar = readFileSync(join(root, 'admin-sidebar.js'), 'utf8');
const mobileAssistCss = readFileSync(join(root, 'admin-assist-bootstrap.css'), 'utf8');
const adminAssistDock = readFileSync(join(root, 'admin-assist-dock.js'), 'utf8');
const canonicalRoutes = readFileSync(join(root, 'admin-canonical-routes.js'), 'utf8');
for (const marker of ['Mobile admin shell authority v3','transform:translateX(-105%)!important','admin-mobile-primary-nav','admin-mobile-drawer-scrim','padding-top:0!important']) {
  if (!mobileWorkbench.includes(marker)) violations.push(`admin-conversation-workbench.css: missing ADMIN-MOBILE-SHELL-003 marker: ${marker}`);
}
for (const marker of ["MOBILE_NAV_CLASS = 'admin-mobile-primary-nav'","DRAWER_SCRIM_CLASS = 'admin-mobile-drawer-scrim'","const setDrawerOpen = open =>"]) {
  if (!mobileSidebar.includes(marker)) violations.push(`admin-sidebar.js: missing ADMIN-MOBILE-SHELL-003 navigation marker: ${marker}`);
}
for (const marker of ["commandEntry.hidden = true","commandEntry.style.setProperty('display', 'none', 'important')","shell.hidden = true","shell.style.setProperty('display', 'none', 'important')"]) {
  if (!mobileSidebar.includes(marker)) violations.push(`admin-sidebar.js: missing ADMIN-CLUTTER-005 single-navigation marker: ${marker}`);
}
for (const marker of ['ADMIN-CLUTTER-005','.admin-command-entry,','.admin-context-tabs-shell','display:none!important']) {
  if (!mobileWorkbench.includes(marker)) violations.push(`admin-conversation-workbench.css: missing ADMIN-CLUTTER-005 visual marker: ${marker}`);
}
for (const marker of ['/api/control/ai/assist','/api/control/ai/v8/pulse','/api/control/ai/actions','handoffCommand','EXTERNAL_SECRET_RE']) {
  if (!adminAssistDock.includes(marker)) violations.push(`admin-assist-dock.js: missing persistent command execution marker: ${marker}`);
}
for (const marker of ['.ekodi-assist-bootstrap{left:auto;right:12px;bottom:76px;padding:0;background:none}','.ekodi-assist-bootstrap-form{width:52px;height:52px;min-height:52px;padding:0}','.ekodi-assist-bootstrap-form input,.ekodi-assist-bootstrap-send{display:none}']) {
  if (!mobileAssistCss.includes(marker)) violations.push(`admin-assist-bootstrap.css: missing ADMIN-MOBILE-SHELL-003 first-paint Assist marker: ${marker}`);
}
for (const marker of ["Mobile admin shell authority v3",".ekodi-assist-bootstrap-plus::after{","content:'AI'","admin-command-active .ekodi-assist-bootstrap{display:none!important}"]) {
  if (!mobileWorkbench.includes(marker)) violations.push(`admin-conversation-workbench.css: missing ADMIN-MOBILE-SHELL-003 lazy Assist marker: ${marker}`);
}
for (const marker of ["window.matchMedia?.('(max-width:760px)').matches","return'platform-overview'","version:'1.7.0'"]) {
  if (!canonicalRoutes.includes(marker)) violations.push(`admin-canonical-routes.js: missing ADMIN-MOBILE-SHELL-003 routing marker: ${marker}`);
}
const adminDesignCss = readFileSync(join(root, 'admin-design-engine.css'), 'utf8');
const authenticatedShell = readFileSync(join(root, 'admin-authenticated-shell.js'), 'utf8');
for (const marker of ['padding-top:0!important', 'height:100dvh!important', 'overflow:hidden!important', 'overflow-y:auto!important', 'overscroll-behavior:contain!important']) {
  if (!adminDesignCss.includes(marker)) violations.push(`admin-design-engine.css: missing role-projected viewport contract marker: ${marker}`);
}
for (const marker of ["nav.dataset.ekodiIndependentScroll='platform-admin'", "main.dataset.ekodiScrollOwner='workspace'", "nav.style.setProperty('overflow-y','auto','important')"]) {
  if (!authenticatedShell.includes(marker)) violations.push(`admin-authenticated-shell.js: missing role-projected scroll ownership marker: ${marker}`);
}

if (violations.length) {
  console.error('❌ Retired admin source policy failed');
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}
console.log('✅ Retired admin source policy passed: deleted implementation stays deleted and old entry paths are explicit 404s.');

await import('./validate-design-engine.mjs');
