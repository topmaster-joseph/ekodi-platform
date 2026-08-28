import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [menu, demand, layout, page, build, perf] = await Promise.all([
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8'),
  readFile(new URL('../ai-module-spec-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8'),
]);

test('administrator menu exposes a dedicated external AI integration spec', () => {
  assert.match(menu, /id: 'ai-module-spec'/);
  assert.match(menu, /외부 AI 연동규격/);
  assert.match(demand, /ai-module-spec-admin\.js/);
  assert.match(demand, /ai-module-spec-admin\.css/);
  assert.match(layout, /#ai-module-spec:ai-module-spec/);
});

test('spec workspace is vendor-handoff ready without exposing privileged credentials', () => {
  assert.match(page, /협력사 전달문 복사/);
  assert.match(page, /EKODI-EXTERNAL-AI-MODULE-SPEC\.md/);
  assert.match(page, /external-ai-module-contract\.json/);
  assert.match(page, /GET \/v1\/health/);
  assert.match(page, /POST \/v1\/execute/);
  assert.match(page, /contractVersion/);
  assert.match(page, /requestId/);
  assert.match(page, /capabilities/);
  assert.match(page, /Google Drive, D1\/Supabase, R2 관리자 자격증명/);
  assert.doesNotMatch(page, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY\s*[:=]\s*['"][^'"]+/);
});

test('external AI spec remains outside the admin first-path payload', () => {
  assert.match(build, /'ai-module-spec-admin\.css','ai-module-spec-admin\.js'/);
  assert.match(perf, /'ai-module-spec-admin\.js','ai-module-spec-admin\.css'/);
  assert.doesNotMatch(page, /setInterval\(/);
});
