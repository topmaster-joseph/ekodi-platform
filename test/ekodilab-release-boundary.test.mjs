import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('EKODI Lab release is centrally guarded and bound to the apex public path',async()=>{
  const [workflow,manifestText,guardrails]=await Promise.all([
    read('.github/workflows/deploy-ekodi-lab-homepage.yml'),
    read('deploy/manifests/ekodilab.pages.json'),
    read('scripts/validate-deployment-guardrails.mjs'),
  ]);
  const manifest=JSON.parse(manifestText);
  assert.equal(manifest.targets.length,1);
  const target=manifest.targets[0];
  assert.equal(target.project,'ekodilab');
  assert.equal(target.directory,'lab-source');
  assert.equal(target.productionUrl,'https://ekodilab.pages.dev/');
  for(const marker of ['에코디연구소','현장에 묻고,','https://ekodi.kr/ekodilab','EKODI LAB'])assert.ok(target.expect.includes(marker),marker);
  for(const marker of ['성수이로 00','1234 5678','https://lab.ekodi.kr','https://ekodilab.pages.dev'])assert.ok(target.forbid.includes(marker),marker);

  assert.match(workflow,/repository: topmaster-joseph\/ekodi-site/);
  assert.match(workflow,/AI_CONTROL_GITHUB_TASK_TOKEN/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(workflow,/guarded-pages-release\.mjs/);
  assert.match(workflow,/ekodilab\.pages\.json/);
  assert.match(workflow,/lab-release\.json/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodilab/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/github\.event_name != 'pull_request'/);
  assert.doesNotMatch(workflow,/\bwrangler\b[^\n]*\bpages\s+deploy\b/i);
  assert.doesNotMatch(workflow,/Configure EKODI DNS|Attach custom domains/);

  assert.match(guardrails,/deploy-ekodi-lab-homepage\.yml/);
  assert.match(guardrails,/AI_CONTROL_GITHUB_TASK_TOKEN/);
  assert.match(guardrails,/ekodilab\.pages\.json/);
});

test('Lab production verifier rejects the stale placeholder build and internal workspace wording',async()=>{
  const workflow=await read('.github/workflows/deploy-ekodi-lab-homepage.yml');
  for(const marker of ['성수이로 00','1234 5678','운영공간','현장에 묻고,','전라남도 무안군 청계면 백련동1길 17-4','https://ekodilab.pages.dev']){
    assert.ok(workflow.includes(marker),marker);
  }
  assert.match(workflow,/sourceSha==\$sha/);
});
