import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('EKODI Lab release is centrally guarded and bound to the apex public path',async()=>{
  const [workflow,manifestText,guardrails,controller]=await Promise.all([
    read('.github/workflows/deploy-ekodi-lab-homepage.yml'),
    read('deploy/manifests/ekodilab.pages.json'),
    read('scripts/validate-deployment-guardrails.mjs'),
    read('scripts/guarded-pages-release.mjs'),
  ]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.targets.length,1);
  const target=manifest.targets[0];
  assert.equal(target.project,'ekodilab');
  assert.equal(target.directory,'sites/ekodi-lab');
  assert.equal(target.productionUrl,'https://ekodilab.pages.dev/');
  for(const marker of ['에코디연구소','현장에 묻고,','https://ekodi.kr/ekodilab','EKODI LAB'])assert.ok(target.expect.includes(marker),marker);
  for(const marker of ['성수이로 00','1234 5678','https://ekodilab.pages.dev'])assert.ok(target.forbid.includes(marker),marker);

  assert.match(workflow,/sites\/ekodi-lab/);
  assert.doesNotMatch(workflow,/AI_CONTROL_GITHUB_TASK_TOKEN/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(workflow,/guarded-pages-release\.mjs/);
  assert.match(workflow,/ekodilab\.pages\.json/);
  assert.match(workflow,/lab-release\.json/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodilab/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/workflow_dispatch:[\s\S]*release_branch_ref:[\s\S]*release_task_id:/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}/);
  assert.doesNotMatch(workflow,/\bwrangler\b[^\n]*\bpages\s+deploy\b/i);
  assert.doesNotMatch(workflow,/Configure EKODI DNS|Attach custom domains/);

  assert.match(guardrails,/deploy-ekodi-lab-homepage\.yml/);
  assert.match(guardrails,/sites\/ekodi-lab/);
  assert.match(guardrails,/ekodilab\.pages\.json/);
  assert.match(controller,/ekodi_release_gate/);
  assert.match(controller,/propagation check/);
  assert.match(controller,/did not converge after/);
});

test('Lab production verifier rejects the stale placeholder build and internal workspace wording',async()=>{
  const workflow=await read('.github/workflows/deploy-ekodi-lab-homepage.yml');
  for(const marker of ['성수이로 00','1234 5678','운영공간','현장에 묻고,','전라남도 무안군 청계면 백련동1길 17-4']){
    assert.ok(workflow.includes(marker),marker);
  }
  assert.match(workflow,/ekodilab\\.pages\\.dev/);
  assert.match(workflow,/sourceSha==\$sha/);
});


test('Lab post-merge deploy is dispatched only by the guarded Orchestrator convergence path',async()=>{
  const converge=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(converge,/const labHomepageTouched=/);
  for(const file of [
    'deploy/manifests/ekodilab.pages.json',
    'scripts/guarded-pages-release.mjs',
    '.github/workflows/deploy-ekodi-lab-homepage.yml',
  ]) assert.ok(converge.includes("'"+file+"'"),file);
  assert.match(converge,/actions\/workflows\/deploy-ekodi-lab-homepage\.yml\/dispatches/);
  assert.match(converge,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(converge,/EKODI Lab deploy dispatch failed/);
});
