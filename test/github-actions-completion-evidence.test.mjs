import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAuthenticatedCompletionEvidence } from '../scripts/github-actions-completion-evidence.mjs';

const taskId='orch_00000000-0000-4000-8000-000000000123';
const branchRef=`ai/chatgpt/${taskId}`;
const mergeSha='0123456789abcdef0123456789abcdef01234567';

function mockGithub(overrides={}){
  return {
    rest:{
      pulls:{
        list:async()=>({data:overrides.pulls||[{
          number:3574,
          html_url:'https://github.com/topmaster-joseph/ekodi-platform/pull/3574',
          merged_at:'2026-10-05T05:45:00Z',
          merge_commit_sha:mergeSha,
          head:{ref:branchRef},
          base:{ref:'main'},
        }]}),
      },
      actions:{
        listWorkflowRunsForRepo:async()=>({data:{workflow_runs:overrides.runs||[
          {id:1,name:'CI',status:'completed',conclusion:'success',html_url:'https://example/ci'},
          {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success',html_url:'https://example/gate'},
          {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:mergeSha,html_url:'https://example/deploy'},
        ]}}),
        listJobsForWorkflowRun:async({run_id})=>({data:{jobs:(overrides.jobsByRun?.[run_id])||[
          {name:'staging',status:'completed',conclusion:'success'},
          {name:'production',status:'completed',conclusion:'success'},
        ]}}),
        listWorkflowRuns:async()=>({data:{workflow_runs:overrides.supersedingRuns||[]}}),
      },
      repos:{
        compareCommits:async()=>({data:{status:overrides.compareStatus||'ahead'}}),
      },
    },
  };
}

test('authenticated GitHub collector requires merged PR, required checks, staging and production',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub(),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.equal(evidence.pr.number,3574);
  assert.equal(evidence.pr.mergeCommitSha,mergeSha);
  assert.deepEqual(evidence.requiredWorkflows.map(x=>x.name),['CI','EKODI AI Orchestration Gate']);
  assert.deepEqual(evidence.deployments[0].stagingJobs,['staging']);
  assert.deepEqual(evidence.deployments[0].productionJobs,['production']);
});

test('missing required workflow fails closed',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({
    github:mockGithub({runs:[
      {id:1,name:'CI',status:'completed',conclusion:'success'},
      {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:mergeSha},
    ]}),
    taskId,branchRef,
  });
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'required_workflow_not_successful');
});

test('failed original deployment can be superseded only by successful main deployment containing merge commit',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({
    github:mockGithub({
      runs:[
        {id:1,name:'CI',status:'completed',conclusion:'success'},
        {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
        {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'cancelled',head_sha:mergeSha},
      ],
      supersedingRuns:[
        {id:4,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:'89abcdef0123456789abcdef0123456789abcdef',html_url:'https://example/deploy4'},
      ],
      jobsByRun:{
        4:[
          {name:'staging',status:'completed',conclusion:'success'},
          {name:'production',status:'completed',conclusion:'success'},
        ],
      },
      compareStatus:'ahead',
    }),
    taskId,branchRef,
  });
  assert.equal(evidence.verified,true);
  assert.equal(evidence.deployments[0].runId,4);
  assert.equal(evidence.deployments[0].supersedesRunId,3);
});

test('staging or production evidence absence forbids completion',async()=>{
  const noStaging=await collectAuthenticatedCompletionEvidence({
    github:mockGithub({jobsByRun:{3:[{name:'production',status:'completed',conclusion:'success'}]}}),
    taskId,branchRef,
  });
  assert.equal(noStaging.verified,false);
  assert.equal(noStaging.reason,'staging_evidence_missing');

  const noProduction=await collectAuthenticatedCompletionEvidence({
    github:mockGithub({jobsByRun:{3:[{name:'staging',status:'completed',conclusion:'success'}]}}),
    taskId,branchRef,
  });
  assert.equal(noProduction.verified,false);
  assert.equal(noProduction.reason,'production_promotion_evidence_missing');
});


test('CGMA validate contract is the only explicit staging-equivalent',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({
    github:mockGithub({
      runs:[
        {id:1,name:'CI',status:'completed',conclusion:'success'},
        {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
        {id:3,workflow_id:43,name:'Deploy CGMA Apex Edge',status:'completed',conclusion:'success',head_sha:mergeSha,html_url:'https://example/cgma'},
      ],
      jobsByRun:{
        3:[
          {name:'validate',status:'completed',conclusion:'success',steps:[
            {name:'Validate CGMA edge contract',status:'completed',conclusion:'success'},
          ]},
          {name:'production',status:'completed',conclusion:'success'},
        ],
      },
    }),
    taskId,branchRef,
  });
  assert.equal(evidence.verified,true);
  assert.deepEqual(evidence.deployments[0].stagingJobs,['validate (preproduction-equivalent)']);
  assert.deepEqual(evidence.deployments[0].productionJobs,['production']);
});

test('CGMA validate without the required contract step still fails closed',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({
    github:mockGithub({
      runs:[
        {id:1,name:'CI',status:'completed',conclusion:'success'},
        {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
        {id:3,workflow_id:43,name:'Deploy CGMA Apex Edge',status:'completed',conclusion:'success',head_sha:mergeSha},
      ],
      jobsByRun:{
        3:[
          {name:'validate',status:'completed',conclusion:'success',steps:[
            {name:'Some other validation',status:'completed',conclusion:'success'},
          ]},
          {name:'production',status:'completed',conclusion:'success'},
        ],
      },
    }),
    taskId,branchRef,
  });
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'staging_evidence_missing');
});
