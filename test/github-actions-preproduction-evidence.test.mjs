import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEkodiPreproductionEvidence } from '../scripts/github-actions-preproduction-evidence.mjs';

const taskId='orch_0123456789abcdef0123456789abcdef';
const branchRef='ai/gpt6/'+taskId;
const sourceSha='a'.repeat(40),releaseSha='b'.repeat(40),digest='sha256:'+'c'.repeat(64),archiveDigest='sha256:'+'d'.repeat(64);
const goodRun=n=>({name:n,status:'completed',conclusion:'success',created_at:'2026-10-29T00:00:00Z',id:200});
const pr={number:501,merged_at:'2026-10-29T00:00:00Z',
  head:{ref:branchRef,sha:sourceSha},base:{ref:'main'},merge_commit_sha:releaseSha};
const deployment={id:808,name:'Deploy Control API',event:'workflow_dispatch',head_sha:releaseSha,head_branch:'main'};
const stage={name:'staging',status:'completed',conclusion:'success',steps:[
  {name:'Verify guarded rollback readiness',status:'completed',conclusion:'success'},
  {name:'Verify immutable application payload digest',status:'completed',conclusion:'success'},
]};
const immutable={id:1111,name:'ekodi-preproduction-'+taskId+'-sha256-'+'c'.repeat(64),expired:false,size_in_bytes:4096,digest:archiveDigest,workflow_run:{id:808}};

function github({prs=[pr],checks=['CI','EKODI AI Orchestration Gate','EKODI Dependency Security'].map(goodRun),
  deployments=[deployment],stages=[stage],artifacts=[immutable]}={}){
  const calls=[];
  const client={rest:{
    pulls:{async list(p){calls.push(['pr',p]);return {data:prs}}},
    actions:{
      async listWorkflowRunsForRepo(p){
        calls.push(['runs',p]);return {data:{workflow_runs:p.event==='pull_request'?checks:deployments}};
      },
      async listJobsForWorkflowRun(p){calls.push(['jobs',p]);return {data:{jobs:stages}}},
      async listWorkflowRunArtifacts(p){calls.push(['artifacts',p]);return {data:{artifacts}}},
    },
  }};
  return {client,calls};
}
const input={taskId,branchRef};

test('read-only collector requires canonical repository and issued task/branch',async()=>{
  const {client,calls}=github();
  for(const details of [
    {taskId:'fake'}, {branchRef:'ai/gpt6/issue-3805'}, {owner:'other'}, {repo:'other'},
    {branchRef:'ai/claude/'+taskId+'-other'},
  ]){
    const r=await collectEkodiPreproductionEvidence({github:client,...input,...details});
    assert.equal(r.verified,false);
  }
  assert.deepEqual(calls,[]);
});
test('requires exactly one official merged PR and real review SHA',async()=>{
  for(const prs of [[],[{...pr,merged_at:null}],[pr,pr],[{...pr,base:{ref:'development'}}],[{...pr,merge_commit_sha:'bad'}]]){
    const r=await collectEkodiPreproductionEvidence({github:github({prs}).client,...input});
    assert.equal(r.verified,false);
  }
});
test('required PR CI, security and EKODI Orchestrator gate cannot be bypassed by caller flags',async()=>{
  for(const checks of [
    ['CI','EKODI AI Orchestration Gate'].map(goodRun),
    ['CI','EKODI AI Orchestration Gate','EKODI Dependency Security'].map(x=>({...goodRun(x),conclusion:x==='CI'?'failure':'success'})),
    [],
  ]){
    const r=await collectEkodiPreproductionEvidence({github:github({checks}).client,...input,stagingVerified:true,approved:true});
    assert.equal(r.verified,false);
    assert.match(r.reason,/required_pr_gate_unverified/);
  }
});
test('staging job alone or wrong rollback step does not count as preproduction proof',async()=>{
  for(const stages of [
    [], [{...stage,conclusion:'skipped'}], [{...stage,steps:[]}],
    [{...stage,steps:[{name:'Deploy staging',status:'completed',conclusion:'success'}]}],
  ]){
    const r=await collectEkodiPreproductionEvidence({github:github({stages}).client,...input});
    assert.equal(r.verified,false);
  }
});
test('staging evidence collected after production has started cannot count as prepromotion proof',async()=>{
  for(const later of [
    {name:'production',status:'in_progress',conclusion:null},
    {name:'deploy-production',status:'completed',conclusion:'success'},
    {name:'release',status:'completed',conclusion:'failure'},
  ]){
    const r=await collectEkodiPreproductionEvidence({
      github:github({stages:[stage,later]}).client,...input,
    });
    assert.equal(r.verified,false);
    assert.equal(r.reason,'staging_rollback_or_immutable_artifact_unverified');
  }
});

test('a GitHub archive SHA is not interchangeable with verified application manifest digest',async()=>{
  const {client}=github();
  const r=await collectEkodiPreproductionEvidence({github:client,...input});
  assert.equal(r.artifactDigest,digest);
  assert.equal(r.archiveDigest,archiveDigest);
  assert.notEqual(r.artifactDigest,r.archiveDigest);
  const withoutApplicationStep=await collectEkodiPreproductionEvidence({
    github:github({stages:[{...stage,steps:[stage.steps[0]]}]}).client,...input,
  });
  assert.equal(withoutApplicationStep.verified,false);
});

test('missing, expired, wrong-run and forged artifact digest never authorize',async()=>{
  for(const artifacts of [
    [], [{...immutable,expired:true}], [{...immutable,name:'other'}],
    [{...immutable,name:'ekodi-preproduction-'+taskId}],
    [{...immutable,name:'ekodi-preproduction-'+taskId+'-sha256-'+'x'.repeat(64)}],
    [{...immutable,digest:'sha256:invalid'}], [{...immutable,workflow_run:{id:9999}}],
    [immutable,immutable],
  ]){
    const r=await collectEkodiPreproductionEvidence({github:github({artifacts}).client,...input});
    assert.equal(r.verified,false);
  }
});
test('successful source, staging, rollback and immutable artifact produces only a read-only evidence proposal',async()=>{
  const {client,calls}=github();
  const r=await collectEkodiPreproductionEvidence({github:client,...input});
  assert.equal(r.verified,true);
  assert.equal(r.source,'github-actions-staging-verifier');
  assert.equal(r.releaseSha,releaseSha);
  assert.equal(r.sourceHeadSha,sourceSha);
  assert.equal(r.artifactDigest,digest);
  assert.equal(r.archiveDigest,archiveDigest);
  assert.equal(r.applicationDigestSource,'staging-validated-immutable-manifest');
  assert.equal(r.stagingRunId,808);
  assert.equal(r.requiredCiVerified,true);
  assert.equal(r.securityReviewVerified,true);
  assert.equal(r.stagingVerified,true);
  assert.equal(r.rollbackReady,true);
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.productionDeployed,false);
  assert.equal(calls.some(([name])=>name==='artifacts'),true);
});
test('an API outage must not be interpreted as positive evidence',async()=>{
  const {client}=github();
  client.rest.actions.listJobsForWorkflowRun=async()=>{throw Error('provider quota exhausted')};
  const r=await collectEkodiPreproductionEvidence({github:client,...input});
  assert.equal(r.verified,false);
  assert.equal(r.reason,'github_staging_evidence_unavailable');
});
