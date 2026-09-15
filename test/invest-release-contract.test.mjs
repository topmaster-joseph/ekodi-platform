import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('Shared Site release verifies the current Invest lazy-load path',async()=>{
  const [workflow,layout,invest]=await Promise.all([
    read('.github/workflows/deploy-site-core.yml'),
    read('admin-menu-layout.js'),
    read('invest-admin.js'),
  ]);
  const importContract="section==='invest')return import('./invest-admin.js')";
  const styleContract="l.href='/admin/invest-admin.css'";
  assert.match(layout,/section==='invest'\)return import\('\.\/invest-admin\.js'\)/);
  assert.match(invest,/l\.href='\/admin\/invest-admin\.css'/);
  assert.ok(workflow.includes(`grep -Fq "${importContract}" dist/admin-menu-layout.js`));
  assert.ok(workflow.includes(`grep -Fq "${styleContract}" dist/invest-admin.js`));
  assert.ok(!workflow.includes("styles:['invest-admin.css']\" dist/admin-demand-loader.js"));
  assert.ok(!workflow.includes("scripts:['invest-admin.js']\" dist/admin-demand-loader.js"));
});
