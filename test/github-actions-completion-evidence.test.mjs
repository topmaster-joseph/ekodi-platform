import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAuthenticatedCompletionEvidence, recoverySourceSha } from '../scripts/github-actions-completion-evidence.mjs';

const taskId='orch_00000000-0000-4000-8000-000000000123';
const branchRef=`ai/chatgpt/${taskId}`;
const mergeSha='0123456789abcdef0123456789abcdef01234567';
const prHeadSha='fedcba9876543210fedcba9876543210fedcba98';

function mockGithub(overrides={}){
  return {
    rest:{
      pulls:{
        // Default: the merged PR changed a runtime file, so a real deployment is required.
        listFiles:async({page})=>({data:page===1?(overrides.files||['independent-board-worker.js']).map(filename=>({filename,status:'modified'})):[]}),
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
            :head_sha===mergeSha
              ?allowed.filter(run=>['push','workflow_dispatch'].includes(run.event)&&(!event||run.event===event)).map(run=>({head_sha:mergeSha,...run}))
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

// 2026-10-23: QTIN, Church History and Marketing Pages promote from `release`/`sync`
// jobs. Only those workflows, with their real deploy steps succeeded, may count.
function equivalentRuns(name){
  return [
    {id:1,name:'CI',status:'completed',conclusion:'success'},
    {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success'},
    {id:3,workflow_id:88,name,event:'workflow_dispatch',status:'completed',conclusion:'success',head_sha:mergeSha},
  ];
}
const qtinStaging={name:'staging_gate / staging',status:'completed',conclusion:'success'};
const qtinReleaseSteps=['Deploy production worker','Verify production order page, health and admin boundary'];
const steps=(names,conclusion='success')=>names.map(name=>({name,status:'completed',conclusion}));

test('QTIN release job with deploy and verify steps counts as production',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:equivalentRuns('Deploy QTIN Group Order'),jobsByRun:{3:[
    qtinStaging,{name:'release',status:'completed',conclusion:'success',steps:steps(qtinReleaseSteps)},
  ]}}),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.deepEqual(evidence.deployments[0].productionJobs,['release (production-equivalent)']);
});

test('production-equivalent job fails closed without its deploy steps or outside the allowlist',async()=>{
  for(const [label,name,jobs] of [
    ['skipped deploy step','Deploy QTIN Group Order',[qtinStaging,{name:'release',status:'completed',conclusion:'success',steps:[...steps([qtinReleaseSteps[0]],'skipped'),...steps([qtinReleaseSteps[1]])]}]],
    ['missing verify step','Deploy QTIN Group Order',[qtinStaging,{name:'release',status:'completed',conclusion:'success',steps:steps([qtinReleaseSteps[0]])}]],
    ['failed release job','Deploy QTIN Group Order',[qtinStaging,{name:'release',status:'completed',conclusion:'failure',steps:steps(qtinReleaseSteps)}]],
    ['not allowlisted workflow','Deploy Something Else',[qtinStaging,{name:'release',status:'completed',conclusion:'success',steps:steps(qtinReleaseSteps)}]],
    ['marketing sync without pages deploy','Deploy Marketing AI Pages',[qtinStaging,{name:'sync',status:'completed',conclusion:'success',steps:steps(['Plan idempotent Pages sync'])}]],
  ]){
    const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:equivalentRuns(name),jobsByRun:{3:jobs}}),taskId,branchRef});
    assert.equal(evidence.verified,false,label);
    assert.equal(evidence.reason,'production_promotion_evidence_missing',label);
  }
});

test('Marketing Pages sync with the rollback-guarded deploy step counts as production',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({runs:equivalentRuns('Deploy Marketing AI Pages'),jobsByRun:{3:[
    qtinStaging,{name:'sync',status:'completed',conclusion:'success',steps:steps(['Deploy all Pages projects with automatic rollback'])},
  ]}}),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.deepEqual(evidence.deployments[0].productionJobs,['sync (production-equivalent)']);
});

// 2026-10-20: a completed zero-job run carries no verdict; it must not mask an
// executed run on the same head SHA, and it must never create a pass by itself.
function ciRuns(ci){
  return [
    ...ci,
    {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success',created_at:'2026-10-20T02:00:00Z'},
    {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:mergeSha},
  ];
}
const zeroJob={11:[]};

test('zero-job CI failure newer than an executed CI success does not block completion',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({
    runs:ciRuns([
      {id:11,name:'CI',status:'completed',conclusion:'failure',created_at:'2026-10-20T02:18:19Z'},
      {id:10,name:'CI',status:'completed',conclusion:'success',created_at:'2026-10-20T02:17:43Z'},
    ]),jobsByRun:zeroJob}),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.equal(evidence.requiredWorkflows[0].runId,10);
});

test('executed CI failure newer than a success still fails closed',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({
    runs:ciRuns([
      {id:11,name:'CI',status:'completed',conclusion:'failure',created_at:'2026-10-20T02:18:19Z'},
      {id:10,name:'CI',status:'completed',conclusion:'success',created_at:'2026-10-20T02:17:43Z'},
    ]),jobsByRun:{11:[{name:'test',status:'completed',conclusion:'failure'}]}}),taskId,branchRef});
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'required_workflow_not_successful');
});

test('pending CI newer than a success defers completion',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({
    runs:ciRuns([
      {id:11,name:'CI',status:'in_progress',conclusion:null,created_at:'2026-10-20T02:18:19Z'},
      {id:10,name:'CI',status:'completed',conclusion:'success',created_at:'2026-10-20T02:17:43Z'},
    ])}),taskId,branchRef});
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'required_workflow_not_successful');
});

test('only zero-job CI runs never count as success',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:mockGithub({
    runs:ciRuns([{id:11,name:'CI',status:'completed',conclusion:'failure',created_at:'2026-10-20T02:18:19Z'}]),jobsByRun:zeroJob}),taskId,branchRef});
  assert.equal(evidence.verified,false);
  assert.equal(evidence.reason,'required_workflow_not_successful');
});

function noDeployGithub(files){
  const github=mockGithub({runs:[
    {id:1,name:'CI',status:'completed',conclusion:'success',html_url:'https://example/ci'},
    {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success',html_url:'https://example/gate'},
  ]});
  github.rest.pulls.listFiles=async({page})=>({data:page===1?files.map(f=>typeof f==='string'?{filename:f,status:'modified'}:f):[]});
  return github;
}

test('merged non-deploy-surface release verifies without a Deploy run',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:noDeployGithub(['eval/README.md','eval/ops-baseline.mjs','.github/workflows/ai-eval-lab.yml']),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.equal(evidence.deliveryKind,'no-deploy-surface');
  assert.equal(evidence.deploymentSurface,'none');
  assert.deepEqual(evidence.deployments,[]);
  assert.deepEqual(evidence.files,['.github/workflows/ai-eval-lab.yml','eval/README.md','eval/ops-baseline.mjs']);
});

test('runtime file or deletion without a Deploy run still fails closed',async()=>{
  for(const files of [['eval/README.md','admin-ai-governor.js'],[{filename:'docs/a.md',status:'removed'}],['.github/workflows/deploy-control-api.yml']]){
    const evidence=await collectAuthenticatedCompletionEvidence({github:noDeployGithub(files),taskId,branchRef});
    assert.equal(evidence.verified,false);
    assert.equal(evidence.reason,'production_deployment_run_missing');
  }
});

function dispatchOnlyGithub(dispatchRuns){
  const github=mockGithub({runs:[
    {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:mergeSha,html_url:'https://example/deploy'},
  ]});
  const base=github.rest.actions.listWorkflowRunsForRepo;
  github.rest.actions.listWorkflowRunsForRepo=async args=>args.event==='workflow_dispatch'&&args.head_sha===prHeadSha
    ?{data:{workflow_runs:dispatchRuns}}
    :base(args);
  return github;
}

test('recovery PR checks dispatched on the PR branch and head SHA count as required workflows',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:dispatchOnlyGithub([
    {id:11,name:'CI',event:'workflow_dispatch',head_sha:prHeadSha,head_branch:branchRef,status:'completed',conclusion:'success',html_url:'https://example/ci'},
    {id:12,name:'EKODI AI Orchestration Gate',event:'workflow_dispatch',head_sha:prHeadSha,head_branch:branchRef,status:'completed',conclusion:'success',html_url:'https://example/gate'},
  ]),taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.deepEqual(evidence.requiredWorkflows.map(x=>x.runId),[11,12]);
});

test('dispatched checks from another branch or SHA are not accepted',async()=>{
  for(const bad of [{head_branch:'main'},{head_sha:mergeSha}]){
    const evidence=await collectAuthenticatedCompletionEvidence({github:dispatchOnlyGithub([
      {id:11,name:'CI',event:'workflow_dispatch',head_sha:prHeadSha,head_branch:branchRef,status:'completed',conclusion:'success',...bad},
      {id:12,name:'EKODI AI Orchestration Gate',event:'workflow_dispatch',head_sha:prHeadSha,head_branch:branchRef,status:'completed',conclusion:'success',...bad},
    ]),taskId,branchRef});
    assert.equal(evidence.verified,false);
    assert.equal(evidence.reason,'required_workflow_not_successful');
  }
});

test('missing merged PR reports unclaimed only when no PR and no branch exist',async()=>{
  const make=({openPulls=[],branch=false})=>{
    const github=mockGithub({});
    github.rest.pulls.list=async({state})=>({data:state==='all'?openPulls:[]});
    github.rest.repos=github.rest.repos||{};
    github.rest.repos.getBranch=async()=>{if(branch)return {data:{}};const e=new Error('Not Found');e.status=404;throw e;};
    return github;
  };
  const none=await collectAuthenticatedCompletionEvidence({github:make({}),taskId,branchRef});
  assert.equal(none.reason,'merged_pr_not_found');
  assert.equal(none.unclaimed,true);
  assert.equal((await collectAuthenticatedCompletionEvidence({github:make({openPulls:[{number:9}]}),taskId,branchRef})).unclaimed,false);
  assert.equal((await collectAuthenticatedCompletionEvidence({github:make({branch:true}),taskId,branchRef})).unclaimed,false);
});

const sourceSha='17deab6ea83f7ff7a6ede120539480a6db42d1e5';
const recoveryTask='orch_recovery_17deab6ea83f7ff7a6ede120539480a6';
const recoveryBranch=`ai/chatgpt/${recoveryTask}`;
const recoveryBody='Automatic EKODI release provenance recovery for #8122.\n\nSource: `ai/chatgpt/devotion-x-20261104@'+sourceSha+'`\n';

test('recovery source SHA must be recorded and match the task id',()=>{
  assert.equal(recoverySourceSha(recoveryTask,recoveryBody),sourceSha);
  assert.equal(recoverySourceSha(recoveryTask,recoveryBody.replace('17deab6e','27deab6e')),null);
  assert.equal(recoverySourceSha(taskId,recoveryBody),null);
  assert.equal(recoverySourceSha(recoveryTask,'no source line'),null);
});

function recoveryGithub({sourceRuns,sourceJobs}){
  const github=mockGithub({
    pulls:[{number:8123,html_url:'https://github.com/x/pull/8123',merged_at:'2026-11-04T05:45:00Z',merge_commit_sha:mergeSha,head:{ref:recoveryBranch,sha:prHeadSha},base:{ref:'main'},body:recoveryBody}],
    runs:[
      {id:1,name:'CI',status:'completed',conclusion:'success',html_url:'https://example/ci'},
      {id:2,name:'EKODI AI Orchestration Gate',status:'completed',conclusion:'success',html_url:'https://example/gate'},
      {id:3,workflow_id:30,name:'Deploy Control API',status:'completed',conclusion:'success',head_sha:mergeSha,html_url:'https://example/deploy'},
    ],
    jobsByRun:{3:[{name:'validate',status:'completed',conclusion:'success'},{name:'staging',status:'completed',conclusion:'skipped'},{name:'production',status:'completed',conclusion:'success'}],77:sourceJobs},
  });
  const base=github.rest.actions.listWorkflowRunsForRepo;
  github.rest.actions.listWorkflowRunsForRepo=async args=>args.head_sha===sourceSha?{data:{workflow_runs:sourceRuns}}:base(args);
  return github;
}

test('recovery release uses staging that succeeded on the recorded source commit of the same workflow',async()=>{
  const evidence=await collectAuthenticatedCompletionEvidence({github:recoveryGithub({
    sourceRuns:[{id:77,workflow_id:30,name:'Deploy Control API',event:'pull_request',head_sha:sourceSha,status:'completed',conclusion:'success'}],
    sourceJobs:[{name:'staging',status:'completed',conclusion:'success'}],
  }),taskId:recoveryTask,branchRef:recoveryBranch});
  assert.equal(evidence.verified,true);
  assert.match(evidence.deployments[0].stagingJobs[0],/source 17deab6e, run 77/);
});

test('source staging from another workflow, a failed job, or a missing run is not accepted',async()=>{
  for(const c of [
    {sourceRuns:[{id:77,workflow_id:99,head_sha:sourceSha,status:'completed',conclusion:'success'}],sourceJobs:[{name:'staging',status:'completed',conclusion:'success'}]},
    {sourceRuns:[{id:77,workflow_id:30,head_sha:sourceSha,status:'completed',conclusion:'success'}],sourceJobs:[{name:'staging',status:'completed',conclusion:'failure'}]},
    {sourceRuns:[],sourceJobs:[]},
  ]){
    const evidence=await collectAuthenticatedCompletionEvidence({github:recoveryGithub(c),taskId:recoveryTask,branchRef:recoveryBranch});
    assert.equal(evidence.verified,false);
    assert.equal(evidence.reason,'staging_evidence_missing');
  }
});

test('deploy run beyond the first 100 runs of a busy merge commit is still found',async()=>{
  const noise=Array.from({length:100},(_,i)=>({id:1000+i,name:'Deploy Control API',event:'workflow_dispatch',head_sha:'f'.repeat(40),status:'completed',conclusion:'success'}));
  const github=mockGithub({});
  const base=github.rest.actions.listWorkflowRunsForRepo;
  const pages=[];
  github.rest.actions.listWorkflowRunsForRepo=async args=>{
    if(args.head_sha!==mergeSha)return base(args);
    pages.push(`${args.event}:${args.page}`);
    if(args.event!=='workflow_dispatch')return {data:{workflow_runs:[]}};
    return {data:{workflow_runs:args.page===1?noise:[{id:3,workflow_id:30,name:'Deploy Control API',event:'workflow_dispatch',head_sha:mergeSha,status:'completed',conclusion:'success',html_url:'https://example/deploy'}]}};
  };
  const evidence=await collectAuthenticatedCompletionEvidence({github,taskId,branchRef});
  assert.equal(evidence.verified,true);
  assert.deepEqual(evidence.deployments.map(d=>d.runId),[3]);
  assert.ok(pages.includes('workflow_dispatch:2'));
});
