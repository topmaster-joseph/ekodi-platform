import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const control=read('admin-ai-control-plane.js');
const css=read('admin-readable-command.css');
const e2e=read('scripts/verify-admin-production-ui-e2e.mjs');
const deploy=read('.github/workflows/deploy-site-core.yml');
const merge=read('scripts/converge-orchestrated-pr-merge.mjs');
const recover=read('scripts/recover-release-provenance.mjs');

test('unavailable GitHub inventory is unknown, not a verified zero',()=>{
  assert.match(control,/const githubKnown=providerData!==null&&!gh\.warning&&Array\.isArray\(gh\.repositories\)/);
  assert.match(control,/저장소 목록 미확인 · GitHub API 상태·권한 점검 필요/);
  assert.match(control,/조회 결과 없음 · 접근 범위 확인 필요/);
  assert.match(control,/조회된 저장소 .*개/);
  assert.ok(!control.includes('repositories · ${esc(gh.mode'), 'unverified 0 repositories label returned');
  assert.match(control,/const githubDot=!githubKnown\|\|!repos\.length\?'warn':''/);
});

test('Cloudflare and GitHub infrastructure detail is only shown within suppliers stage',()=>{
  assert.match(css,/AIOPS-PROVIDER-DETAIL-20261030/);
  assert.match(css,/#aiOpsPanel\[data-aiops-stage\] > \[data-ekodi-provider-card\] \{/);
  assert.match(css,/#aiOpsPanel\[data-aiops-stage="providers"\] > \[data-ekodi-provider-card\] \{/);
  assert.match(css,/display:none!important/);
  assert.match(css,/display:block!important/);
  assert.match(e2e,/const inventoryCard=root\.locator\('\[data-ekodi-provider-card\]'\)/);
  assert.match(e2e,/AI Ops infrastructure card staged visibility mismatch/);
  assert.match(e2e,/summary\.includes\('0 repositories'\)/);
});

test('all modified admin assets have exact receipt-bound Site Core release ownership',()=>{
  const allowed=["'admin-ai-control-plane.js'","'admin-readable-command.css'","'scripts/verify-admin-production-ui-e2e.mjs'"];
  for(const marker of allowed){
    assert.ok(deploy.includes(marker), 'Site Core push filter missing '+marker);
    assert.ok(merge.includes(marker), 'Orchestrator convergent dispatcher missing '+marker);
    assert.ok(recover.includes(marker), 'Orchestrator immediate recovery dispatcher missing '+marker);
  }
  assert.match(merge,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(deploy,/release_branch_ref:/);
});
