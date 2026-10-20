import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAuthenticatedCompletionEvidence } from '../scripts/github-actions-completion-evidence.mjs';

const taskId='orch_00000000-0000-4000-8000-000000000123';
const branchRef=`ai/chatgpt/${taskId}`;
const mergeSha='0123456789abcdef0123456789abcdef01234567';
const prHeadSha='fedcba9876543210fedcba9876543210fedcba98';

function mockGithub(overrides={}){
  return {
    rest:{
      pulls:{
        list:async()=>({data:overrides.pulls||[{
          number:3574,
          html_url:'https://github.com/topmaster-joseph/ekodi-platform/pull/3574',
          merged_at:'2026-10-05T05:45:00Z',
          merge_commit_sha:mergeSha,
          head:{ref:branchRef,sha:prHeadSha},
          base:{ref:'main'},
        }]}),
      },
      actions:{
        listWorkflowRunsForRepo:async({head_sha,event})=>{
          const all=overrides.runs||[
            {id:1,name:'CI',status:'completed',conclusion:'success',html_url:'https://example/ci'},
            {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success',html_url:'https://example/gate'},
            {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:mergeSha,html_url:'https://example/deploy'},
          ];
          const allowed=all.map(run=>({...run,event:run.event||(run.name.startsWith('Deploy ')?'push':'pull_request')}));
          return {data:{workflow_runs:head_sha===prHeadSha&&event==='pull_request'
            ?allowed.filter(run=>run.event==='pull_request')
            :head_sha===mergeSha&&!event
              ?allowed.filter(run=>['push','workflow_dispatch'].includes(run.event))
              :[]}};
        },
        listJobsForWorkflowRun:async({run_id})=>({data:{jobs:(overrides.jobsByRun?.[run_id])||[
          {name:'staging',status:'completed',conclusion:'success'},
          {name:'production',status:'completed',conclusion:'success'},
        ]}}),
        listWorkflowRuns:async({event,branch})=>({data:{workflow_runs:(overrides.supersedingRuns||[]).filter(run=>(!run.event||run.event===event)&&(!run.head_branch||run.head_branch===branch||overrides.ignoreBranchFilter))}}),
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


test('independent-board workflow_dispatch requires exact preproduction contract before completion',async()=>{
  const runs=[
    {id:1,name:'CI',status:'completed',conclusion:'success'},
    {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
    {id:33,workflow_id:333,name:'Deploy Independent Board',event:'workflow_dispatch',status:'completed',conclusion:'success',head_sha:mergeSha},
  ];
  const jobsByRun={33:[
    {name:'validate',status:'completed',conclusion:'success',steps:[{name:'Validate standalone board contract',status:'completed',conclusion:'success'}]},
    {name:'deploy',status:'completed',conclusion:'success'},
  ]};
  const verified=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs,jobsByRun}),taskId,branchRef});
  assert.equal(verified.verified,true);
  assert.deepEqual(verified.deployments[0].stagingJobs,['validate (preproduction-equivalent)']);
  assert.deepEqual(verified.deployments[0].productionJobs,['deploy']);
  assert.equal(verified.deployments[0].runId,33);

  const invalid=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs,jobsByRun:{33:[
    {name:'validate',status:'completed',conclusion:'success',steps:[{name:'unrelated check',status:'completed',conclusion:'success'}]},
    {name:'deploy',status:'completed',conclusion:'success'},
  ]}}),taskId,branchRef});
  assert.equal(invalid.verified,false);
  assert.equal(invalid.reason,'staging_evidence_missing');
});

test('production completion refuses PR-only workflow runs when no real deployment was dispatched',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:[
    {id:1,name:'CI',status:'completed',conclusion:'success'},
    {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
    {id:3,name:'Deploy Independent Board',event:'pull_request',status:'completed',conclusion:'success'},
  ]}),taskId,branchRef});
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'production_deployment_run_missing');
});

// 2026-10-20: production deploys are workflow_dispatch runs on main; a later
// dispatched run containing the merge must be able to supersede a cancelled or
// failed one, without relaxing branch, recency, ancestry or job requirements.
const cancelledOriginal=[
  {id:1,name:'CI',status:'completed',conclusion:'success'},
  {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
  {id:3,workflow_id:30,name:'Deploy EKODI Shared Site Core',event:'workflow_dispatch',status:'completed',conclusion:'cancelled',head_sha:mergeSha,created_at:'2026-10-19T16:51:02Z'},
];
const dispatched=(extra={})=>({id:5,workflow_id:30,name:'Deploy EKODI Shared Site Core',event:'workflow_dispatch',head_branch:'main',status:'completed',conclusion:'success',head_sha:'89abcdef0123456789abcdef0123456789abcdef',created_at:'2026-10-19T16:56:28Z',html_url:'https://example/deploy5',...extra});

test('a later successful workflow_dispatch deploy on main supersedes a cancelled dispatch',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:cancelledOriginal,supersedingRuns:[dispatched()],compareStatus:'ahead'}),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.equal(evidence.deployments[0].runId,5);
  assert.equal(evidence.deployments[0].supersedesRunId,3);
});

test('dispatched superseding run must be on main, newer, and contain the merge commit',async()=>{
  for(const [label,overrides] of [
    ['non-main branch',{supersedingRuns:[dispatched({head_branch:'ai/claude/x'})],ignoreBranchFilter:true}],
    ['older than original',{supersedingRuns:[dispatched({created_at:'2026-10-19T16:00:00Z'})]}],
    ['does not contain merge',{supersedingRuns:[dispatched()],compareStatus:'behind'}],
    ['other event type',{supersedingRuns:[dispatched({event:'schedule'})]}],
  ]){
    const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:cancelledOriginal,...overrides}),taskId,branchRef});
    assert.equal(evidence.verified,false,label);
    assert.equal(evidence.reason,'deployment_run_not_successful',label);
  }
});

test('dispatched superseding run still needs staging and production jobs',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:cancelledOriginal,supersedingRuns:[dispatched()],jobsByRun:{5:[{name:'staging',status:'completed',conclusion:'success'}]}}),taskId,branchRef});
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'production_promotion_evidence_missing');
});
