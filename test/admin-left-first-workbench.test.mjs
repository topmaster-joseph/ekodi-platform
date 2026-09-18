import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin uses a left-first progressive menu with one-click work-area activation', async () => {
  const [registry, sidebar] = await Promise.all([
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
  ]);
  assert.match(registry, /id: 'workspaces'.*ko: '조직·고객'.*en: 'Workspaces'/);
  assert.match(sidebar, /const PRIMARY_SECTIONS = Object\.freeze\(/);
  for (const marker of [
    "home: ['command-home', 'campus']",
    "operations: ['work', 'communication', 'finance', 'tax']",
    "workspaces: ['clients', 'cmpmyi', 'organization', 'workspace']",
    "services: ['common-services', 'marketing-ai', 'community', 'social', 'books']",
    "system: ['health', 'aiops', 'ai-settings', 'devices', 'security', 'admins', 'api-cost']",
  ]) assert.ok(sidebar.includes(marker), marker);
  assert.match(sidebar, /dataset\.adminDetailMore = group/);
  assert.match(sidebar, /간단히 보기/);
  assert.match(sidebar, /더보기/);
  assert.match(sidebar, /activateSection\(nav, getAdminMenuGroupDefault\(group\)\)/);
  assert.match(sidebar, /admin-context-tabs-shell/);
  assert.match(sidebar, /display:none!important/);
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
