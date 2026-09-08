import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('EKODI AI management is a canonical on-demand admin menu', () => {
  const registry = read('admin-menu-registry.js');
  const loader = read('admin-demand-loader.js');
  const routes = read('admin-canonical-routes.js');
  const layout = read('admin-menu-layout.js');
  assert.match(registry, /id: 'ai-settings'/);
  assert.match(loader, /ai-management-admin\.js/);
  assert.match(loader, /ai-management-admin\.css/);
  assert.match(routes, /'ai-settings':'operations'/);
  assert.match(layout, /#ai-settings:ai-settings/);
});

test('AI management UI exposes personal-first resources without collecting provider secrets', () => {
  const admin = read('ai-management-admin.js');
  assert.match(admin, /개인 AI 구독/);
  assert.match(admin, /개인 API/);
  assert.match(admin, /EKODI 공용 API/);
  assert.match(admin, /Hosted AI/);
  assert.match(admin, /CORE LEARNING/);
  assert.doesNotMatch(admin, /type=["']password["']/);
});
test('build and additive migration carry the AI management surface and Core learning ledger', () => {
  const build = read('scripts/build.mjs');
  const migration = read('migrations/0075_ai_core_learning.sql');
  assert.match(build, /ai-management-admin\.css/);
  assert.match(build, /ai-management-admin\.js/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_core_learning_events/);
  assert.match(migration, /idx_ai_core_learning_events_capability_created/);
});

test('AI management unifies resource routing and dynamic provider Router Score', () => {
  const admin = read('ai-management-admin.js');
  assert.match(admin, /RESOURCE ROUTER/);
  assert.match(admin, /PROVIDER ROUTER SCORE/);
  assert.match(admin, /data-provider-weight/);
  assert.match(admin, /\/api\/control\/common-services\/ai\/status/);
  assert.match(admin, /PROVIDERS · METRICS/);
  assert.match(admin, /POLICY AUDIT/);
  assert.match(admin, /\[1,2,3,4\]\.map/);
  assert.match(admin, /Origin AI · LOCK/);
});
