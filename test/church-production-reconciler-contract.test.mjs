import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Church production release publishes and verifies source revision',async()=>{
  const deploy=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(deploy,/CHURCH_SOURCE_SHA=\$\(git -C church rev-parse HEAD\)/);
  assert.match(deploy,/church-release\.json/);
  assert.match(deploy,/ekodi\.church-release\.v1/);
  assert.match(deploy,/process\.env\.CHURCH_SOURCE_SHA/);
  assert.match(deploy,/sourceSha == \$sha/);
});

test('Church reconciler stays central and uses no cross-repository secret',async()=>{
  const workflow=await read('.github/workflows/reconcile-ekodi-church-homepage.yml');
  assert.match(workflow,/cron: '17 \* \* \* \*'/);
  assert.match(workflow,/actions: write/);
  assert.match(workflow,/git ls-remote https:\/\/github\.com\/topmaster-joseph\/ekodi-church\.git refs\/heads\/main/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodichurch\/church-release\.json/);
  assert.match(workflow,/node scripts\/dispatch-guarded-church-release\.mjs/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF:/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID:/);
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow,/PAT|PERSONAL_ACCESS|CLOUDFLARE_API_TOKEN/);
});

test('Both independent Church watchers require the receipt-bound dispatch helper',async()=>{
  const watcher=await read('.github/workflows/watch-ekodi-church-source.yml');
  assert.match(watcher,/node scripts\/dispatch-guarded-church-release\.mjs/);
  assert.match(watcher,/EKODI_RELEASE_BRANCH_REF:/);
  assert.match(watcher,/EKODI_RELEASE_TASK_ID:/);
  assert.doesNotMatch(watcher,/\-d '\\{"ref":"main"\\}'/);
});
test('Only real EKODI receipts can dispatch Church Pages; no missing-data fallback',async()=>{
  const {validateAuthorizedChurchReceipt,dispatchChurchRelease}=await import('../scripts/dispatch-guarded-church-release.mjs');
  const task='orch_recovery_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const branch='ai/gpt6/'+task;
  assert.deepEqual(validateAuthorizedChurchReceipt({authorized:true,taskId:task,branchRef:branch,authority:'ekodi-orchestrator',state:'assigned'},200,branch,task),{branch,task});
  assert.throws(()=>validateAuthorizedChurchReceipt({authorized:false},403,branch,task));
  assert.throws(()=>validateAuthorizedChurchReceipt({authorized:true,taskId:task,branchRef:branch,authority:'ekodi-orchestrator',state:'blocked'},200,branch,task));
  let requests=0;
  const result=await dispatchChurchRelease({env:{},fetchImpl:async()=>{requests++;throw Error('must not fetch')},log:{log:()=>{}}});
  assert.equal(result.dispatched,false);assert.equal(requests,0);
  await assert.rejects(dispatchChurchRelease({env:{GH_TOKEN:'masked',GITHUB_REPOSITORY:'topmaster-joseph/ekodi-platform',EKODI_RELEASE_BRANCH_REF:branch,EKODI_RELEASE_TASK_ID:task},fetchImpl:async()=>{
    requests++;
    return {status:403,json:async()=>({authorized:false})};
  },log:{log:()=>{}}}));
  assert.equal(requests,1,'rejected receipt never triggers GitHub deployment');
});
test('Worship Pages deploy verifies date-specific real content, not a 200 fallback',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/Verify October 18 worship page/);
  assert.match(w,/church\/worship\/2026-10-18\/materials\.json/);
  assert.match(w,/grep -Fq '신명기 33:12–19'/);
  assert.match(w,/grep -Fq '\?view=stage'/);
});
