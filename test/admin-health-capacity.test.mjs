import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Health capacity panel reports only bounded verified concurrency with evidence links', async () => {
  const source = await read('system-capacity-admin.js');
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /maxVerifiedConcurrency:\s*20/);
  assert.match(source, /stages:\s*\[1, 5, 10, 20\]/);
  assert.match(source, /동시 사용자 수의 추정치가 아니라 실제 운영 URL/);
  assert.match(source, /다음 단계 50\+는 아직 미검증/);
  assert.match(source, /actions\/runs\/32541529236/);
  assert.match(source, /scripts\/ecosystem-load-test\.mjs/);
  assert.doesNotMatch(source, /최대\s*20명/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /fetch\(/);
});

test('capacity evidence preserves the measured production load-test results', async () => {
  const source = await read('system-capacity-admin.js');
  for (const marker of [
    "rps: 326.64, p95: 83.9",
    "rps: 396.94, p95: 66.8",
    "rps: 620.26, p95: 43.4",
    "rps: 690.79, p95: 40.7",
    "rps: 204.40, p95: 98.8",
    "rps: 403.55, p95: 61.9",
    "rps: 471.48, p95: 57.2",
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /peakErrorPct:\s*0/);
  assert.match(source, /p95TargetMs:\s*1500/);
  assert.match(source, /incidentMs:\s*2500/);
  assert.match(source, /errorBudgetPct:\s*1/);
});

test('capacity evidence is appended to existing lazy Health assets instead of the admin first path', async () => {
  const [postbuild, pkg, loader, css] = await Promise.all([
    read('scripts/admin-health-capacity-postbuild.mjs'),
    read('package.json'),
    read('admin-demand-loader.js'),
    read('system-capacity-admin.css'),
  ]);
  assert.match(postbuild, /dist}system-health-admin\.js/);
  assert.match(postbuild, /dist}system-health-admin\.css/);
  assert.match(pkg, /admin-health-capacity-postbuild\.mjs/);
  assert.match(loader, /health:[\s\S]*scripts:\s*\['system-health-admin\.js'\]/);
  assert.doesNotMatch(loader, /system-capacity-admin/);
  assert.match(css, /\.health-capacity-stages/);
  assert.match(css, /\.health-capacity-table/);
});
