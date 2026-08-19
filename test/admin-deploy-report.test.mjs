import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin production workflow publishes a durable verification checkpoint', async () => {
  const workflow = await read('.github/workflows/deploy-admin-ai-ops.yml');
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /id: production_verify/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /VERIFY_OUTCOME: \$\{\{ steps\.production_verify\.outcome \}\}/);
  assert.match(workflow, /gh issue comment 333/);
  assert.match(workflow, /PRODUCTION VERIFIED/);
  assert.match(workflow, /PRODUCTION NOT VERIFIED/);
  assert.match(workflow, /flat AI Ops · internal specialist routing · action-first Chief AI/);
});

test('shared-site guarded release verifies the current Admin thin-shell contract', async () => {
  const manifest = JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  const admin = manifest.worker.requests.find(item => item.url === 'https://admin.ekodi.kr/');
  assert.ok(admin, 'admin.ekodi.kr smoke request must exist');
  assert.ok(admin.expect.includes('EKODI Control Center'));
  assert.ok(admin.expect.includes('admin-authenticated-shell.js?v=20260819-e2e-perf-1'));
  assert.ok(admin.expect.includes('compact-control-center.js admin-menu-layout.js admin-demand-loader.js'));
  assert.equal(admin.expect.includes('control-center-features.js'), false);
  assert.ok(admin.headerExpect.includes('x-ekodi-route: admin-control-center'));
});
