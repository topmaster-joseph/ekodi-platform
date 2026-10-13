import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const dispatch=source('scripts/converge-orchestrated-pr-merge.mjs');
const workflow=source('.github/workflows/deploy-ekodibiz.yml');
const manifest=JSON.parse(source('deploy/manifests/shared-site.worker.json'));

test('LANG-UI-001: EKODIBIZ service-owned public app changes issue receipt-bound releases',()=>{
  const start=dispatch.indexOf('const ekodibizPublicTouched=');
  const end=dispatch.indexOf('const aiControlTouched=',start);
  assert.ok(start>0&&end>start);
  const owned=dispatch.slice(start,end);
  for(const asset of ['ekodibiz/','ekodibiz-worker.js','deploy-ekodibiz.yml']){
    assert.ok(owned.includes(asset),`missing EKODIBIZ deploy owner for ${asset}`);
  }
  assert.match(dispatch,/if\(ekodibizPublicTouched\)\{/);
  assert.match(dispatch,/\/actions\/workflows\/deploy-ekodibiz\.yml\/dispatches/);
  assert.match(dispatch,/release_branch_ref:branch,release_task_id:taskId/);
});

test('EKODIBIZ guarded workflow accepts only exact authorized main release',()=>{
  assert.match(workflow,/workflow_dispatch:\s*\n\s*inputs:/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  assert.match(workflow,/inputs\.release_branch_ref != ''/);
  assert.match(workflow,/inputs\.release_task_id != ''/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/scripts\/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/ekodibiz\.worker\.json/);
});

test('shared Site Core route canary confirms the Biz shared Shell and preserves footer',()=>{
  const probe=manifest.worker.requests.find(x=>x.url==='https://ekodi.kr/ekodibiz');
  assert.ok(probe);
  assert.ok(probe.headerExpect.includes('x-ekodi-shell: v2'));
  assert.ok(probe.headerExpect.includes('x-ekodi-user-ui: v1'));
  assert.ok(probe.headerExpect.includes('x-ekodi-user-footer: service'));
  assert.ok(probe.forbid.includes('data-ekodi-operating-space-label'));
  assert.ok(!probe.headerExpect.includes('x-ekodi-operating-space-label: v1'));
});
