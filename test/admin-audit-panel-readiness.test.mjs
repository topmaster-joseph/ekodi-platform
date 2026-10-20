import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI Ops delegated audit access waits for mounted alias panel, not merely a nav button',async()=>{
  const demand=await readFile(new URL('../admin-demand-loader.js',import.meta.url),'utf8');
  const admin=await readFile(new URL('../admin-menu-layout.js',import.meta.url),'utf8');
  const ops=await readFile(new URL('../ai-ops-admin.js',import.meta.url),'utf8');
  const block=demand.slice(demand.indexOf('    aiops: {'),demand.indexOf("    'ai-settings':"));
  assert.match(block,/real: '\[data-section="aiops"\]'/);
  assert.match(block,/ready: '#aiOpsPanel\[data-panel~="audit-records"\]'/);
  assert.match(demand,/if\(feature\.ready\)await waitFor\(feature\.ready,1e4\)/);
  assert.match(admin,/const delegated=getAdminMenuItem\(section\)\?\.delegateSection/);
  assert.match(admin,/await window\.EKODIAdminDemand\.activate\(demandKey\)/);
  assert.match(ops,/section\.dataset\.panel = `\$\{SECTION\} audit-records`/);
  assert.match(ops,/node\.hidden = !visible/);
});

test('audit readiness never fabricates session or skips genuine Chromium panel assertions',async()=>{
  const demand=await readFile(new URL('../admin-demand-loader.js',import.meta.url),'utf8');
  const verifier=await readFile(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');
  assert.match(demand,/if \(!feature\|\|!authenticated\(\)\) return/);
  assert.match(verifier,/!panel\.hidden && !panel\.classList\.contains\('hidden-panel'\)/);
  assert.match(verifier,/panel visibility did not stabilize/);
  assert.doesNotMatch(demand,/audit-records.*role\s*:\s*'super_admin'/);
});
