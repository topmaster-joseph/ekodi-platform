import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Health is a visible standalone route between AI Ops and later operational features', async () => {
  const menu = await read('admin-menu-layout.js');
  const loader = await read('admin-demand-loader.js');
  assert.match(menu, /'campus', 'aiops', 'health'/);
  assert.match(menu, /\['#health', 'health'\]/);
  assert.match(menu, /\['health', '#health'\]/);
  assert.match(loader, /health:\s*\{/);
  assert.match(loader, /insert: 'after-aiops'/);
  assert.match(loader, /deployments:\s*\{[\s\S]*?insert: 'after-health'/);
});

test('Health assets do not ride along with AI Ops secondary hydration', async () => {
  const loader = await read('admin-demand-loader.js');
  const aiOpsBlock = loader.match(/aiops:\s*\{([\s\S]*?)\n\s*\},\n\s*health:/)?.[1] || '';
  assert.ok(aiOpsBlock);
  assert.doesNotMatch(aiOpsBlock, /system-health-admin/);
  assert.doesNotMatch(aiOpsBlock, /system-health-admin\.css/);
});

test('Health has no polling and calls analytics only from explicit activation flow', async () => {
  const health = await read('system-health-admin.js');
  assert.doesNotThrow(() => new Function(health));
  assert.match(health, /button\.addEventListener\('click', activate\)/);
  assert.match(health, /fetch\(`\$\{API_BASE\}\/api\/control\/system-health\?days=\$\{days\}`/);
  assert.match(health, /function activate\(\)/);
  assert.match(health, /load\(false\)/);
  assert.doesNotMatch(health, /setInterval\(/);
  assert.doesNotMatch(health, /IntersectionObserver/);
});
