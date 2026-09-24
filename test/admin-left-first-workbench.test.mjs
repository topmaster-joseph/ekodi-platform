import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin uses a seven-area primary sidebar with contextual top navigation', async () => {
  const [registry, sidebar] = await Promise.all([
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
  ]);
  for (const marker of [
    "id: 'summary'", "id: 'services'", "id: 'sites'", "id: 'people'",
    "id: 'content'", "id: 'status'", "id: 'settings-records'",
  ]) assert.ok(registry.includes(marker), marker);
  for (const marker of [
    "summary: ['platform-overview']",
    "services: ['engine-all', 'engine-core', 'engine-common', 'engine-operations', 'engine-professional', 'engine-ai', 'engine-integration', 'engine-preview']",
    "sites: ['sites-all', 'sites-core', 'sites-business', 'sites-community', 'sites-clients', 'sites-knowledge', 'sites-communication', 'sites-worklife', 'sites-other', 'sites-preparing']",
    "people: ['users-access', 'admins', 'security', 'ai-membership']",
    "content: ['work', 'communication', 'community', 'books', 'social']",
    "status: ['health', 'deployments', 'aiops', 'devices', 'api-cost']",
    "'settings-records': ['public-site-controls', 'language-status', 'ai-settings', 'storage', 'audit-records', 'ai-module-spec']",
  ]) assert.ok(sidebar.includes(marker), marker);
  assert.match(sidebar, /admin-context-tabs-shell/);
  assert.match(sidebar, /display:flex!important/);
  assert.match(sidebar, /admin-command-entry/);
  assert.match(sidebar, /dataset\.adminCommandHome = 'true'/);
  assert.match(sidebar, /activateSection\(nav, 'command-home'\)/);
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
  assert.match(principles, /왼쪽은 기능 선택, 오른쪽은 실행, 아래는 에코디와 대화/);
});

test('Integrated overview removes duplicate singleton tab and keeps health cards readable on the light admin shell', async () => {
  const [sidebar, healthJs, healthCss] = await Promise.all([
    read('admin-sidebar.js'),
    read('system-health-admin.js'),
    read('system-health-admin.css'),
  ]);
  assert.match(sidebar, /const singleEquivalent = ids\.length === 1/);
  assert.match(sidebar, /shell\.dataset\.adminSingleContext = singleEquivalent \? 'true' : 'false'/);
  assert.match(sidebar, /tabs\.hidden = singleEquivalent/);
  assert.match(healthJs, /<h2>플랫폼 통합현황<\/h2>/);
  assert.match(healthJs, /<span>운영 연결 상태<\/span>/);
  assert.match(healthCss, /body\.admin-compact #ekodiSystemHealth\{--muted:#66768a;--health-surface:#fff/);
  assert.match(healthCss, /\.core-health-grid article\[data-state="ok"\] b/);
});

