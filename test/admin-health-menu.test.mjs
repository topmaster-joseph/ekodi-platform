import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Health remains a visible standalone route before Security and later operational features', async () => {
  const menu = await read('admin-menu-layout.js');
  const loader = await read('admin-demand-loader.js');
  assert.match(menu, /'campus', 'aiops', 'health', 'security'/);
  assert.match(menu, /\['#health'\s*,\s*'health'\]/);
  assert.match(menu, /\['health'\s*,\s*'#health'\]/);
  assert.match(loader, /health:\s*\{/);
  assert.match(loader, /health:\s*\{[\s\S]*?insert: 'after-aiops'/);
  assert.match(loader, /security:\s*\{[\s\S]*?insert: 'after-health'/);
  assert.match(loader, /deployments:\s*\{[\s\S]*?insert: 'after-security'/);
});

test('Health assets do not ride along with AI Ops secondary hydration', async () => {
  const loader = await read('admin-demand-loader.js');
  const aiOpsBlock = loader.match(/aiops:\s*\{([\s\S]*?)\n\s*\},\n\s*health:/)?.[1] || '';
  assert.ok(aiOpsBlock);
  assert.doesNotMatch(aiOpsBlock, /system-health-admin/);
  assert.doesNotMatch(aiOpsBlock, /system-health-admin\.css/);
});

test('Health has no polling and reads analytics only from explicit activation flow', async () => {
  const health = await read('system-health-admin.js');
  assert.doesNotThrow(() => new Function(health));
  assert.match(health, /button\.addEventListener\('click', activate\)/);
  assert.match(health, /fetchJson\(`\/api\/control\/system-health\?days=\$\{days\}`, true\)/);
  assert.match(health, /function activate\(\)/);
  assert.match(health, /load\(false\)/);
  assert.doesNotMatch(health, /setInterval\(/);
  assert.doesNotMatch(health, /IntersectionObserver/);
});

test('Health is the read-only EKODI Core operations dashboard', async () => {
  const [health, css] = await Promise.all([
    read('system-health-admin.js'),
    read('system-health-admin.css'),
  ]);
  assert.match(health, /EKODI Core & System Health/);
  assert.match(health, /data-core-card="core"/);
  assert.match(health, /data-core-card="database"/);
  assert.match(health, /data-core-card="backup"/);
  assert.match(health, /data-core-card="ai"/);
  assert.match(health, /\/api\/core\/v1\/status/);
  assert.match(health, /\/api\/core\/v1\/ai\/status/);
  assert.match(health, /\/api\/core\/v1\/recovery\/status', true/);
  assert.match(health, /\/api\/control\/overview', true/);
  assert.match(health, /확인되지 않은 항목은 정상으로 간주하지 않습니다/);
  assert.match(css, /\.core-health-grid/);
  assert.match(css, /\.core-health-fleet-row/);
  assert.doesNotMatch(health, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});

test('Health diagrams stay lightweight and are driven by existing read-only data', async () => {
  const [health, css] = await Promise.all([
    read('system-health-admin.js'),
    read('system-health-admin.css'),
  ]);
  assert.match(health, /data-health-flow/);
  assert.match(health, /data-health-state-matrix/);
  assert.match(health, /data-health-bottlenecks/);
  assert.match(health, /data-request-flow/);
  assert.match(health, /data-checkpoint="analytics"/);
  assert.match(health, /function renderTrafficFlow\(data\)/);
  assert.match(css, /\.health-flow-node/);
  assert.match(css, /\.health-bottleneck-row/);
  assert.match(css, /\.health-request-track/);
  assert.doesNotMatch(health, /setInterval\(/);
  assert.doesNotMatch(health, /chart\.js|recharts|d3\./i);
});
