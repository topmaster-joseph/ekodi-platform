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
    "sites: ['sites-all', 'sites-internal', 'sites-user', 'sites-customer-partner', 'sites-independent', 'sites-preparing']",
    "people: ['users-access', 'admins', 'security', 'ai-membership']",
    "content: ['work', 'communication', 'community', 'books', 'social']",
    "status: ['health', 'deployments', 'aiops', 'devices', 'api-cost']",
    "'settings-records': ['public-site-controls', 'language-status', 'ai-settings', 'storage', 'audit-records', 'ai-module-spec']",
  ]) assert.ok(sidebar.includes(marker), marker);
  assert.match(sidebar, /admin-context-tabs-shell/);
  assert.match(sidebar, /display:flex!important/);
  assert.match(sidebar, /globals\.querySelector\(`:scope>\.\$\{DETAILS_CLASS\}`\)\?\.remove\(\)/);
  assert.match(sidebar, /primary-sidebar-tabs-v3/);
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
