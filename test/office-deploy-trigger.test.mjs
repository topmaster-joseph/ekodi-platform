import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
const worker=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');

test('Shared Site Core guarded production owner notices office hub source changes',()=>{
  assert.match(workflow,/name: Deploy EKODI Shared Site Core/);
  assert.match(workflow,/push:\s*\n\s*branches: \[main\]\s*\n\s*paths:/);
  assert.match(workflow,/^\s+- 'office-prototype\/\*\*'$/m);
  assert.match(workflow,/^\s+- '\.github\/workflows\/deploy-site-core\.yml'$/m);
  assert.match(workflow,/needs: \[staging_gate, reliability_gate\]/);
});
test('office trigger points at built static hub, not a new app or unrestricted API',()=>{
  assert.match(build,/office-prototype\/index\.html/);
  assert.match(build,/office-prototype\/office\.css/);
  assert.match(build,/office-prototype\/office\.js/);
  assert.match(worker,/url\.pathname === '\/office' \|\| url\.pathname\.startsWith\('\/office\/'\)/);
  assert.match(worker,/OFFICE_HUB_CSP/);
  assert.match(worker,/office-method-blocked/);
});
