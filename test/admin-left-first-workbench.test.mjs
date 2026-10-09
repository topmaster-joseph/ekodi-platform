import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Platform Admin uses eleven distinct control areas with active direct-task navigation', async () => {
  const [registry, sidebar] = await Promise.all([
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
  ]);
  for (const marker of ["id: 'summary'","id: 'sites'","id: 'people'","id: 'services'","id: 'content'","id: 'finance'","id: 'status'","id: 'releases'","id: 'devices-agent'","id: 'settings-records'","id: 'security-audit'"])
    assert.ok(registry.includes(marker), marker);
  for (const marker of [
    "summary: ['platform-overview']",
    "sites: ['sites-all', 'sites-business', 'sites-clients', 'sites-community', 'sites-core', 'sites-preparing']",
    "people: ['users-access', 'admins', 'ai-membership']",
    "services: ['engine-all', 'engine-core', 'engine-common', 'engine-operations', 'engine-professional', 'engine-ai', 'engine-integration', 'engine-preview']",
    "content: ['work', 'communication', 'community', 'books', 'social']",
    "finance: ['finance', 'api-cost']",
    "status: ['health', 'site-health', 'architecture', 'maturity']",
    "releases: ['deployments', 'aiops']",
    "'devices-agent': ['devices', 'pos-agent']",
    "'settings-records': ['public-site-controls', 'language-status', 'ai-settings', 'storage', 'ai-module-spec']",
    "'security-audit': ['security', 'audit-records']",
  ]) assert.ok(sidebar.includes(marker), marker);
  assert.match(sidebar, /nav\.querySelector\(':scope>\.admin-command-entry'\)\?\.remove\(\)/);
  assert.match(sidebar, /main\?\.querySelector\(':scope>\.admin-context-tabs-shell'\)\?\.remove\(\)/);
  assert.doesNotMatch(sidebar, /dataset\.adminCommandHome/);
  assert.doesNotMatch(sidebar, /commandEntry = document\.createElement/);
  assert.doesNotMatch(sidebar, /shell = document\.createElement/);
    assert.match(sidebar, /role-projected-sidebar-v4/);
  assert.match(sidebar, /renderSidebarDetails\(nav, globals, group, displayedSection \|\| section, locale\)/);
});
test('Functional Admin pages keep only the bottom EKODI composer until conversation is opened', async () => {
  const [bootstrapCss, dockCss, principles] = await Promise.all([
    read('admin-assist-bootstrap.css'),
    read('admin-assist-dock.css'),
    read('ADMIN_UI_PRINCIPLES.md'),
  ]);
  assert.match(bootstrapCss, /\.ekodi-assist-bootstrap\{position:fixed/);
  assert.match(bootstrapCss, /bottom:0/);
  assert.match(dockCss, /body\.admin-command-history-ready:not\(\.admin-command-home\) \.content\{margin-left:0!important\}/);
  assert.match(dockCss, /body:not\(\.admin-command-home\) \.ekodi-assist\.history-only\{display:none!important\}/);
  assert.match(dockCss, /body:not\(\.admin-command-home\) \.ekodi-assist:not\(\.history-only\) \.ekodi-assist-rail\{display:none!important\}/);
  assert.match(principles, /역할에 맞는 왼쪽 업무선택 → 오른쪽 실행 → 아래는 에코디와 대화/);
});

test('Integrated overview removes duplicate singleton tab and keeps health cards readable on the light admin shell', async () => {
  const [sidebar, healthJs, healthCss] = await Promise.all([
    read('admin-sidebar.js'),
    read('system-health-admin.js'),
    read('system-health-admin.css'),
  ]);
  assert.doesNotMatch(sidebar, /function renderContextTabs/);
  assert.match(sidebar, /LEFT-NAV-AUTHORITY-006/);
  assert.match(healthJs, /<h2>플랫폼 통합현황<\/h2>/);
  assert.match(healthJs, /<span>운영 연결 상태<\/span>/);
  assert.match(healthCss, /body\.admin-compact #ekodiSystemHealth\{--muted:#66768a;--health-surface:#fff/);
  assert.match(healthCss, /\.core-health-grid article\[data-state="ok"\] b/);
});



test('ADMIN-DIRECT-NAV-006 makes the visible left task the final destination without duplicate reselection', async () => {
  const [principles, design, verifier, cmpmyi] = await Promise.all([
    read('ADMIN_UI_PRINCIPLES.md'),
    read('config/design-engine.json'),
    read('scripts/verify-admin-production-ui-e2e.mjs'),
    read('store-portfolio-admin-page.js'),
  ]);
  assert.match(principles, /ADMIN-DIRECT-NAV-006/);
  assert.match(principles, /왼쪽에서 이미 선택한 동일 업무·브랜드·서비스를 오른쪽 카드나 버튼으로 다시 선택/);
  const config = JSON.parse(design);
  assert.equal(config.admin.directNavigationContract.leftTaskIsFinalDestination, true);
  assert.equal(config.admin.directNavigationContract.duplicateRightSideReselectionForbidden, true);
  assert.match(verifier, /resolveMenuTrigger/);
  assert.equal(verifier.includes('admin-context-tab[data-admin-context-section'), false);
  assert.match(cmpmyi, /data-cmpmyi-direct-workspace/);
  assert.match(cmpmyi, /중간 선택 카드를 없앴습니다/);
});
