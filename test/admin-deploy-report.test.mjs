import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin production verifier runs after successful canonical shared-site releases and publishes failures only', async () => {
  const workflow = await read('.github/workflows/deploy-admin-ai-ops.yml');
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \['Deploy EKODI Shared Site Core'\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /id: production_verify/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /Publish Admin deployment failure checkpoint/);
  assert.match(workflow, /needs\.validate\.result != 'success'/);
  assert.match(workflow, /steps\.production_verify\.outcome != 'success'/);
  assert.match(workflow, /VERIFY_OUTCOME: \$\{\{ steps\.production_verify\.outcome \}\}/);
  assert.match(workflow, /gh issue comment 333/);
  assert.match(workflow, /PRODUCTION NOT VERIFIED/);
  assert.doesNotMatch(workflow, /PRODUCTION VERIFIED/);
  assert.match(workflow, /fingerprinted thin shell · immutable assets · standalone Health · flat AI Ops · internal specialist routing/);
  assert.doesNotMatch(workflow, /guarded-worker-release\.mjs/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN/);
});

test('Admin production verification follows the content fingerprint and lazy AI Ops plus standalone Health contract', async () => {
  const workflow = await read('.github/workflows/deploy-admin-ai-ops.yml');
  assert.match(workflow, /admin-authenticated-shell\\\.js\\\?v=\[a-f0-9\]\{16\}/);
  assert.match(workflow, /EXPECTED_VERSION/);
  assert.match(workflow, /LIVE_VERSION/);
  assert.match(workflow, /max-age=31536000, immutable/);
  assert.match(workflow, /verify_asset 'ai-ops-admin\.css'/);
  assert.match(workflow, /verify_asset 'system-health-admin\.js'/);
  assert.match(workflow, /verify_asset 'system-health-admin\.css'/);
  assert.match(workflow, /navLabel\.textContent = '시스템 건강'/);
  assert.match(workflow, /pageTitle\.textContent = '시스템 건강'/);
  assert.match(workflow, /#aiOpsPanel \.ai-chief-chat\{order:1!important;position:static!important/);
  assert.match(workflow, /verify_compact_without_readable_css/);
  assert.match(workflow, /! grep -Fq 'admin-readable-command\.css' \/tmp\/compact-css/);
  assert.doesNotMatch(workflow, /grep -Fq '#aiOpsPanel \.ai-chief-chat[^\n]*dist\/admin-compact\.css/);
});

test('shared-site guarded release accepts any valid content fingerprint instead of a stale fixed version', async () => {
  const manifest = JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  const admin = manifest.worker.requests.find(item => item.url === 'https://admin.ekodi.kr/');
  assert.ok(admin, 'admin.ekodi.kr smoke request must exist');
  assert.ok(admin.expect.includes('EKODI Admin'));
  assert.ok(admin.expect.includes('admin-authenticated-shell.js?v='));
  assert.ok(admin.expect.includes('https://auth.ekodi.kr/?site=admin'));
  assert.equal(admin.expect.some(value => value.includes('20260819-e2e-perf-1')), false);
  assert.ok(admin.expect.includes('admin-compact.js admin-menu-layout.js admin-demand-loader.js'));
  assert.equal(admin.expect.includes('control-center-features.js'), false);
  assert.ok(admin.headerExpect.includes('x-ekodi-route: admin-shell'));
  assert.ok(admin.headerExpect.includes('cache-control: no-store'));
});
