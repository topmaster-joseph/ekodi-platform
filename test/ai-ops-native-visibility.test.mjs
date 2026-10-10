import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [ai,menu,dispatcher,site]=await Promise.all([
  read('ai-ops-admin.js'),
  read('admin-menu-layout.js'),
  read('scripts/converge-orchestrated-pr-merge.mjs'),
  read('.github/workflows/deploy-site-core.yml'),
]);

test('AI Ops native hidden property and CSS class both track the same selected section',()=>{
  const begin=ai.indexOf('  function showSection(');
  const end=ai.indexOf('  function installNav()',begin);
  assert.ok(begin>=0&&end>begin,'AI Ops section activation must exist');
  const activation=ai.slice(begin,end);
  assert.match(activation,/const visible\s*=\s*targets\.includes\(SECTION\)/);
  assert.match(activation,/node\.classList\.toggle\('hidden-panel',\s*!visible\)/);
  assert.match(activation,/node\.hidden\s*=\s*!visible/);
  assert.match(menu,/panel\.hidden\s*=\s*true/);
  assert.match(menu,/panel\.removeAttribute\('hidden'\)/);
});

test('AI Ops route retains id, panel alias and authenticated demand module',()=>{
  assert.match(ai,/const SECTION = 'aiops'/);
  assert.match(ai,/section\.id = 'aiOpsPanel'/);
  assert.match(ai,/section\.dataset\.panel = `\$\{SECTION\} audit-records`/);
  assert.match(menu,/#ai-ops:aiops/);
});

test('AI Ops fixes dispatch official Shared Site release, not unprotected static-only pushes',()=>{
  const section=dispatcher.slice(dispatcher.indexOf('const sharedSiteTouched='),dispatcher.indexOf('async function dispatchPostMergeDeploys()'));
  assert.ok(section.includes("file==='ai-ops-admin.js'"));
  assert.match(dispatcher,/if\(sharedSiteTouched\)\{/);
  assert.match(dispatcher,/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
  assert.ok(site.includes("'ai-ops-admin.js'"));
});
