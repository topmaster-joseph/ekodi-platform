import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEkodiStagingEvidence} from '../scripts/write-ekodi-staging-evidence.mjs';

const taskId='orch_0123456789abcdef0123456789abcdef';
const branchRef='ai/gpt6/'+taskId,sourceSha='a'.repeat(40);
const applicationDigest='sha256:'+'b'.repeat(64);
const stagingUrl='https://ekodi-ai-control-staging.example.workers.dev/';
const valid=()=>({taskId,branchRef,sourceSha,applicationDigest,stagingUrl});

test('pending staging evidence is strictly task/branch/source SHA bound but grants no rollback or release permission',()=>{
  const out=makeEkodiStagingEvidence(valid());
  assert.equal(out.record.taskId,taskId);
  assert.equal(out.record.branchRef,branchRef);
  assert.equal(out.record.sourceSha,sourceSha);
  assert.equal(out.record.applicationDigest,applicationDigest);
  assert.equal(out.record.appBytesVerified,true);
  assert.equal(out.record.rollbackReady,false);
  assert.equal(out.record.ownerApproved,false);
  assert.equal(out.record.releaseAuthorized,false);
  assert.equal(out.record.productionDeployed,false);
  assert.match(out.artifactName,/^ekodi-staging-pending-/);
  assert.doesNotMatch(out.artifactName,/^ekodi-preproduction-/);
});

test('unissued task, wrong branch and unsupported SHA/digest cannot create staging metadata',()=>{
  for(const change of [
    {taskId:'issue-3805'},{branchRef:'ai/claude/orch_other'},
    {sourceSha:'a'.repeat(39)},{applicationDigest:'sha256:bad'},
    {branchRef:'main'},
  ])assert.throws(()=>makeEkodiStagingEvidence({...valid(),...change}),/EKODI_STAGING_EVIDENCE_/);
});

test('only exact AI Control staging hostname on https without paths or credentials qualifies',()=>{
  for(const stagingUrl of [
    'http://ekodi-ai-control-staging.example.workers.dev/',
    'https://unrelated.example.workers.dev/',
    'https://ekodi-ai-control-staging.example.workers.dev/admin',
    'https://ekodi-ai-control-staging.example.workers.dev/?secret=x',
    'https://person:secret@ekodi-ai-control-staging.example.workers.dev/',
    'https://ekodi-ai-control-staging.example.workers.dev.evil.example/',
    'https://ekodi.kr/ai',
  ])assert.throws(()=>makeEkodiStagingEvidence({...valid(),stagingUrl}),/STAGING_ENDPOINT_INVALID/);
});

test('stale or future-dated verification cannot be archived',()=>{
  for(const verifiedAt of ['2000-01-01T00:00:00Z','not-a-date',
    new Date(Date.now()+30*60*1000).toISOString()]){
    assert.throws(()=>makeEkodiStagingEvidence({...valid(),verifiedAt}),/STALE_VERIFICATION_TIMESTAMP/);
  }
});

test('official candidate uploader remains only pending staging evidence and preserves production gate',()=>{
  const wf=readFileSync(new URL('../.github/workflows/deploy-ai-control.yml',import.meta.url),'utf8');
  const staging=wf.slice(wf.indexOf('  deploy-staging:'),wf.indexOf('  deploy-production:'));
  assert.match(staging,/Verify immutable application payload digest/);
  assert.match(staging,/Preserve task-bound immutable staging metadata/);
  assert.match(staging,/Upload pending staging evidence only/);
  assert.match(staging,/node scripts\/write-ekodi-staging-evidence\.mjs --write/);
  assert.match(staging,/steps\.staging_metadata\.outputs\.artifact_name/);
  assert.match(staging,/github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(staging,/Verify guarded rollback readiness/);
  assert.doesNotMatch(staging,/EKODI_FINAL_PROMOTION_MODE:\s*enforced/);
  const collector=readFileSync(new URL('../scripts/github-actions-preproduction-evidence.mjs',import.meta.url),'utf8');
  assert.match(collector,/ekodi-preproduction-\$\{task\}-sha256-/);
  assert.doesNotMatch(collector,/ekodi-staging-pending/);
});
