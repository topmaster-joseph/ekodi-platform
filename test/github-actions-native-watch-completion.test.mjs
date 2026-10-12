import test from 'node:test';
import assert from 'node:assert/strict';
import {collectAuthenticatedCompletionEvidence} from '../scripts/github-actions-completion-evidence.mjs';

const taskId='orch_recovery_dcf5dace563ac6da0488a29708afcf21';
const branchRef='ai/gpt6/'+taskId;
const sha='a'.repeat(40), head='b'.repeat(40);
const files=[
 '.github/workflows/ekodi-native-operations-watch.yml',
 'config/ekodi-native-monitoring-ownership.json',
 'scripts/ekodi-native-operations-watch.mjs',
 'test/ekodi-native-operations-watch.test.mjs',
];
const merged='2026-10-12T13:54:00Z';
function success(id, name, attrs={}){return {id,name,status:'completed',conclusion:'success',...attrs}}
function githubFixture({withRun=true,changedFiles=files,expired=false,wrongBranch=false,artifactSize=1024,runSuccess=true,omitStep=false,compareStatus='ahead'}={}){
 const calls=[];
 const github={rest:{
  pulls:{
   list:async()=>({data:[{number:4383,html_url:'https://github.com/topmaster-joseph/ekodi-platform/pull/4383',
    merged_at:merged,merge_commit_sha:sha,head:{ref:branchRef,sha:head},base:{ref:'main'}}]}),
   listFiles:async args=>{calls.push(['files',args]);return {data:changedFiles.map(filename=>({filename,status:'added'}))}},
  },
  actions:{
   listWorkflowRunsForRepo:async args=>{calls.push(['workflowForRepo',args]);return {data:{workflow_runs:[
    success(11,'CI'),success(12,'EKODI AI Orchestration Gate'),
   ]}}},
   getWorkflow:async args=>{calls.push(['getWorkflow',args]);return {data:{id:382137714,state:'active',
    path:'.github/workflows/ekodi-native-operations-watch.yml'}}},
   listWorkflowRuns:async args=>{calls.push(['listWorkflowRuns',args]);return {data:{workflow_runs:withRun&&args.event==='schedule'?[
    success(101,'EKODI Native Operations Watch',{created_at:'2026-10-12T15:37:00Z',
     event:'schedule',head_branch:wrongBranch?'feature':'main',head_sha:head,
     html_url:'https://github.com/topmaster-joseph/ekodi-platform/actions/runs/101',
     ...(!runSuccess?{conclusion:'failure'}:{})}),
   ]:[]}}},
   listJobsForWorkflowRun:async args=>{calls.push(['jobs',args]);return {data:{jobs:[
    success(202,'observe',{steps:[
     success(301,'Collect EKODI-owned read-only operational evidence'),
     ...(omitStep?[]:[success(302,'Preserve privacy-safe evidence, including failures')]),
    ]}),
   ]}}},
   listWorkflowRunArtifacts:async args=>{calls.push(['artifacts',args]);return {data:{artifacts:[
    {id:303,name:'ekodi-native-operations-101',expired,size_in_bytes:artifactSize,workflow_run:{id:101}},
   ]}}},
  },
  repos:{compareCommits:async args=>{calls.push(['compare',args]);return {data:{status:compareStatus}}}},
 }};
 return {github,calls};
}
const evidence=(opts={})=>collectAuthenticatedCompletionEvidence({
 github:githubFixture(opts).github,taskId,branchRef,
});

test('only explicit Human Gate PR file scope + successful observe + artifact may complete native release',async()=>{
 const x=await evidence();
 assert.equal(x.verified,true);
 assert.equal(x.deliveryKind,'github-actions-schedule');
 assert.equal(x.nativeWorkflow.runId,101);
 assert.equal(x.nativeWorkflow.artifactBytes,1024);
 assert.deepEqual(x.deployments,[]);
 assert.deepEqual(x.requiredWorkflows.map(y=>y.name),['CI','EKODI AI Orchestration Gate']);
});
test('no first actual observe run means terminal completion remains forbidden',async()=>{
 const x=await evidence({withRun:false});
 assert.equal(x.verified,false);
 assert.equal(x.reason,'native_observe_success_missing');
});
test('unrelated file and removed/expanded source scope may not skip Worker deployment checks',async()=>{
 const x=await evidence({changedFiles:[...files,'worker.js']});
 assert.equal(x.verified,false);
 assert.equal(x.reason,'native_release_file_scope_invalid');
});
test('only post-merge main-branch scheduled or manual dispatch qualifies',async()=>{
 assert.equal((await evidence({wrongBranch:true})).reason,'native_observe_success_missing');
 assert.equal((await evidence({runSuccess:false})).reason,'native_observe_success_missing');
 assert.equal((await evidence({compareStatus:'diverged'})).reason,'native_observe_success_missing');
});
test('non-empty unexpired artifact and both authenticated observe steps are mandatory',async()=>{
 assert.equal((await evidence({expired:true})).reason,'native_evidence_artifact_missing');
 assert.equal((await evidence({artifactSize:0})).reason,'native_evidence_artifact_missing');
 assert.equal((await evidence({omitStep:true})).reason,'native_observe_steps_missing');
});
test('wrong task does not gain native release exemption',async()=>{
 const x=await collectAuthenticatedCompletionEvidence({
  github:githubFixture().github,
  taskId:'orch_00000000-0000-4000-8000-000000000123',
  branchRef:'ai/gpt6/orch_00000000-0000-4000-8000-000000000123',
 });
 assert.equal(x.verified,false);
 assert.equal(x.reason,'merged_pr_not_found');
});
