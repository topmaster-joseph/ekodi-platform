import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Shared Site release verifies the current Invest lazy-load contract', async () => {
  const [workflow, layout, invest] = await Promise.all([
    read('.github/workflows/deploy-site-core.yml'),
    read('admin-menu-layout.js'),
    read('invest-admin.js')
  ]);
  assert.ok(layout.includes("import('./invest-admin.js')"));
  assert.ok(invest.includes("l.href='/admin/invest-admin.css'"));
  assert.ok(workflow.includes("grep -Fq 'invest-admin.js' dist/admin-menu-layout.js"));
  assert.ok(workflow.includes("grep -Fq '/admin/invest-admin.css' dist/invest-admin.js"));
  assert.ok(!workflow.includes("styles:['invest-admin.css']\" dist/admin-demand-loader.js"));
  assert.ok(!workflow.includes("scripts:['invest-admin.js']\" dist/admin-demand-loader.js"));
});
