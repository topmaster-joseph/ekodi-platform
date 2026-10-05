import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOrchestratorCompletionEvidence } from '../ekodi-orchestrator-task-adapter.js';

const taskId='orch_00000000-0000-4000-8000-000000000123';
const branchRef=`ai/chatgpt/${taskId}`;
const mergeSha='0123456789abcdef0123456789abcdef01234567';
const supersedingSha='89abcdef0123456789abcdef0123456789abcdef';

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
}

function happyFetch(overrides={}){
  return async input=>{
    const url=new URL(String(input));

    if(url.hostname==='api.github.com'&&url.pathname.endsWith('/pulls')){
      return json([{
        number:3570,
        html_url:'https://github.com/topmaster-joseph/ekodi-platform/pull/3570',
        merged_at:'2026-10-05T04:25:00Z',
        merge_commit_sha:mergeSha,
        head:{ref:branchRef},
        base:{ref:'main'},
      }]);
    }

    if(url.hostname==='api.github.com'&&url.pathname.endsWith('/actions/runs')){
      return json({workflow_runs:[
        {id:1,name:'CI',status:'completed',conclusion:'success',html_url:'https://example/ci'},
        {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success',html_url:'https://example/gate'},
        {
          id:3,
          workflow_id:333,
          head_sha:mergeSha,
          name:'Deploy Control API',
          status:overrides.deployStatus||'completed',
          conclusion:Object.hasOwn(overrides,'deployConclusion')?overrides.deployConclusion:'success',
          html_url:'https://example/deploy',
        },
      ]});
    }

    if(url.hostname==='api.github.com'&&url.pathname.endsWith('/actions/workflows/333/runs')){
      return json({workflow_runs:overrides.supersede?[{
        id:4,
        workflow_id:333,
        head_sha:supersedingSha,
        name:'Deploy Control API',
        status:'completed',
        conclusion:'success',
        html_url:'https://example/deploy-4',
      }]:[]});
    }

    if(url.hostname==='api.github.com'&&url.pathname.includes('/compare/')){
      return json({status:overrides.compareStatus||'ahead'});
    }

    if(url.hostname==='api.github.com'&&(url.pathname.endsWith('/actions/runs/3/jobs')||url.pathname.endsWith('/actions/runs/4/jobs'))){
      return json({jobs:overrides.jobs||[
        {name:'staging',status:'completed',conclusion:'success'},
        {name:'production',status:'completed',conclusion:'success'},
      ]});
    }

    if(String(input)==='https://ekodi.kr/api/health'){
      return json(overrides.health||{ok:true,service:'ekodi-auth-api',version:4},overrides.healthStatus||200);
    }

    throw new Error(`unexpected fetch: ${String(input)}`);
  };
}

test('verified merged release reconciles only after CI, staging, production and live health evidence',async()=>{
  const evidence=await collectOrchestratorCompletionEvidence({taskId,branchRef,fetchImpl:happyFetch()});
  assert.equal(evidence.verified,true);
  assert.equal(evidence.pr.number,3570);
  assert.equal(evidence.pr.mergeCommitSha,mergeSha);
  assert.deepEqual(evidence.requiredWorkflows.map(item=>item.name),['CI','EKODI AI Orchestration Gate']);
  assert.deepEqual(evidence.deployments[0].stagingJobs,['staging']);
  assert.deepEqual(evidence.deployments[0].productionJobs,['production']);
  assert.equal(evidence.deployments[0].supersedesRunId,null);
  assert.equal(evidence.live.ok,true);
});

test('running or failed deployment cannot be reconciled without a verified superseding release',async()=>{
  const running=await collectOrchestratorCompletionEvidence({
    taskId,branchRef,fetchImpl:happyFetch({deployStatus:'in_progress',deployConclusion:null}),
  });
  assert.equal(running.verified,false);
  assert.equal(running.reason,'deployment_run_not_successful');

  const failed=await collectOrchestratorCompletionEvidence({
    taskId,branchRef,fetchImpl:happyFetch({deployConclusion:'failure'}),
  });
  assert.equal(failed.verified,false);
  assert.equal(failed.reason,'deployment_run_not_successful');
});

test('later successful main deployment may reconcile a cancelled transient release when it contains the merge commit',async()=>{
  const evidence=await collectOrchestratorCompletionEvidence({
    taskId,
    branchRef,
    fetchImpl:happyFetch({deployStatus:'completed',deployConclusion:'cancelled',supersede:true}),
  });
  assert.equal(evidence.verified,true);
  assert.equal(evidence.deployments[0].runId,4);
  assert.equal(evidence.deployments[0].supersedesRunId,3);
});

test('superseding deployment is rejected when it does not contain the task merge commit',async()=>{
  const evidence=await collectOrchestratorCompletionEvidence({
    taskId,
    branchRef,
    fetchImpl:happyFetch({deployStatus:'completed',deployConclusion:'cancelled',supersede:true,compareStatus:'diverged'}),
  });
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'deployment_run_not_successful');
});

test('production completion fails closed when staging or production promotion evidence is missing',async()=>{
  const noStaging=await collectOrchestratorCompletionEvidence({
    taskId,branchRef,fetchImpl:happyFetch({jobs:[
      {name:'production',status:'completed',conclusion:'success'},
    ]}),
  });
  assert.equal(noStaging.verified,false);
  assert.equal(noStaging.reason,'staging_evidence_missing');

  const noProduction=await collectOrchestratorCompletionEvidence({
    taskId,branchRef,fetchImpl:happyFetch({jobs:[
      {name:'staging',status:'completed',conclusion:'success'},
    ]}),
  });
  assert.equal(noProduction.verified,false);
  assert.equal(noProduction.reason,'production_promotion_evidence_missing');
});

test('live health failure forbids false completion',async()=>{
  const evidence=await collectOrchestratorCompletionEvidence({
    taskId,branchRef,fetchImpl:happyFetch({health:{ok:false},healthStatus:503}),
  });
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'live_health_failed');
});

test('task and orchestrator-issued branch must match exactly',async()=>{
  const evidence=await collectOrchestratorCompletionEvidence({
    taskId,
    branchRef:`ai/chatgpt/orch_00000000-0000-4000-8000-000000000999`,
    fetchImpl:happyFetch(),
  });
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'invalid_task_or_branch');
});
