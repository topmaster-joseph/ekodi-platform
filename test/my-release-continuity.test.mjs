import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMyRelease,myReleaseChange} from '../scripts/reconcile-my-postmerge-release.mjs';

const mainSha='a262487123215e1edcaca775c545636fadbc8906';
const sourceSha='0a5793ef0de07c3d857dd21991e57d28f0aa0da9';
const branch='ai/gpt6/orch_recovery_0a5793ef0de07c3d857dd21991e57d28';
const time=Date.parse('2026-10-15T13:05:00Z');
function candidate(){
  return {number:4856,state:'closed',merged_at:'2026-10-15T12:51:49Z',
    merge_commit_sha:mainSha,base:{ref:'main'},
    head:{ref:branch,sha:sourceSha,repo:{full_name:'topmaster-joseph/ekodi-platform'}}};
}
function decide(overrides={}){
  return classifyMyRelease({pr:candidate(),mainSha,
    changedFiles:['my/person-digital-card.js','test/my-canonical-mount-release.test.mjs'],
    runs:[],now:time,...overrides});
}
test('the approved merged My fix is eligible only for existing protected deploy dispatch',()=>{
  const result=decide();
  assert.equal(result.dispatch,true);
  assert.equal(result.reason,'verified_missing_release');
  assert.equal(result.mainSha,mainSha);
  assert.equal(result.prNumber,4856);
  assert.equal(result.taskId,'orch_recovery_0a5793ef0de07c3d857dd21991e57d28');
});
test('never dispatch a foreign branch, unmerged revision, stale merge or changed main',()=>{
  assert.equal(decide({mainSha:'c'.repeat(40)}).dispatch,false);
  assert.equal(decide({pr:{...candidate(),merged_at:null}}).dispatch,false);
  assert.equal(decide({pr:{...candidate(),base:{ref:'development'}}}).dispatch,false);
  assert.equal(decide({pr:{...candidate(),head:{...candidate().head,ref:'ai/gpt6/unapproved'}}}).dispatch,false);
  assert.equal(decide({pr:{...candidate(),head:{...candidate().head,repo:{full_name:'other/repo'}}}}).dispatch,false);
  assert.equal(decide({now:time+4*24*3600000}).dispatch,false);
  assert.equal(decide({changedFiles:['README.md']}).dispatch,false);
  assert.equal(myReleaseChange(['.github/workflows/deploy-my.yml']),true);
  assert.equal(myReleaseChange(['my-worker.js']),true);
});
test('do not duplicate in-flight, successful or failed guarded releases',()=>{
  for(const [status,conclusion] of [
    ['queued',null],['waiting',null],['in_progress',null],
    ['completed','success'],['completed','failure'],
    ['completed','cancelled'],['completed','timed_out']
  ]){
    const result=decide({runs:[{head_sha:mainSha,status,conclusion}]});
    assert.equal(result.dispatch,false,status+'/'+conclusion);
  }
  assert.equal(decide({runs:[{head_sha:'e'.repeat(40),status:'completed',conclusion:'success'}]}).dispatch,true);
});
test('the release continuity workflow invokes only the guarded My deploy and never weakens production protections',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/reconcile-my-postmerge-release.yml',import.meta.url),'utf8');
  const source=readFileSync(new URL('../scripts/reconcile-my-postmerge-release.mjs',import.meta.url),'utf8');
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/actions: write/);
  assert.match(workflow,/node --test test\/my-release-continuity\.test\.mjs/);
  assert.match(source,/verifyOrchestratorReleaseReceipt/);
  assert.match(source,/release_branch_ref:decision\.branch/);
  assert.match(source,/release_task_id:decision\.taskId/);
  assert.match(source,/workflows\/deploy-my\.yml\/dispatches/);
  assert.doesNotMatch(source,/wrangler deploy|wrangler versions deploy|CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow,/wrangler deploy|CLOUDFLARE_API_TOKEN/);
});
