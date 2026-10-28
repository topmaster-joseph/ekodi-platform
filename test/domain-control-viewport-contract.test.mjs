import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../domain-control-admin.js',import.meta.url),'utf8');
test('domain navigation clears inherited workspace scroll only when actual domain panel is visible',()=>{
  assert.match(source,/function revealDomainWorkspace\(\)/);
  assert.match(source,/panel\.hidden \|\| panel\.classList\.contains\('hidden-panel'\)/);
  assert.match(source,/content\?\.closest\('main'\)/);
  assert.match(source,/workspace\.scrollTop = 0/);
  assert.match(source,/content\.scrollTop = 0/);
  assert.match(source,/revealDomainWorkspace\(\);\s*void loadData\(\)/);
  assert.match(source,/revealDomainWorkspace\(\);\s*await loadData\(\)/);
});
test('domain module retains server-driven registry and role check',()=>{
  assert.match(source,/session\?\.role !== 'super_admin'/);
  assert.match(source,/const REGISTRY_URL = 'https:\/\/ekodi\.kr\/api\/registry'/);
  assert.match(source,/data-domctl-filter="attention"/);
});
