import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  educationReleaseChanged,approvedEducationMerge
} from '../scripts/education-release-continuity.mjs';
import {ORIGIN,ROUTE,VIEWPORTS} from '../scripts/verify-education-bootcamp-native.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sha=value=>value.repeat(40);
const branch='ai/chatgpt/orch_recovery_08f0272aefb8910b6d5c5b2578160cf0';
const source=sha('a'),merged=sha('b');
const event={action:'completed',workflow_run:{conclusion:'success',head_branch:branch,head_sha:source}};
const pr={number:4689,state:'closed',merged_at:'2026-10-14T11:20:01Z',
 head:{ref:branch,sha:source},base:{ref:'main'},merge_commit_sha:merged};

test('Education-only changed path is explicit and guarded',()=>{
  assert.equal(educationReleaseChanged(['education/study/ai-bootcamp/index.html']),true);
  assert.equal(educationReleaseChanged(['education-worker.js']),true);
  assert.equal(educationReleaseChanged(['.github/workflows/deploy-education.yml']),true);
  assert.equal(educationReleaseChanged(['scripts/verify-education-bootcamp-native.mjs']),true);
  assert.equal(educationReleaseChanged(['scripts/education-release-continuity.mjs']),true);
  assert.equal(educationReleaseChanged(['sites/seonammedi/public/app.js']),false);
  assert.equal(educationReleaseChanged(['docs/MNU-AI-BOOTCAMP-EDUCATION.md']),false);
  assert.equal(educationReleaseChanged([]),false);
});

test('Only a merged exact source on current main can dispatch',()=>{
  const accepted=approvedEducationMerge({event,pr,files:['education/study/ai-bootcamp/index.html'],mainSha:merged});
  assert.deepEqual(accepted,{ready:true,reason:'verified_source_and_main',branch,
    taskId:'orch_recovery_08f0272aefb8910b6d5c5b2578160cf0',mergeSha:merged,sourceSha:source,pr:4689});
  const deny=(changes,reason)=>{
    const result=approvedEducationMerge({...{event,pr,files:['education/app.js'],mainSha:merged},...changes});
    assert.equal(result.ready,false);
    assert.equal(result.reason,reason);
  };
  deny({event:{...event,workflow_run:{...event.workflow_run,conclusion:'failure'}}},'convergence_not_successful');
  deny({event:{...event,workflow_run:{...event.workflow_run,head_branch:'ai/chatgpt/invalid'}}},'not_an_official_orchestrator_branch');
  deny({pr:{...pr,merged_at:null,state:'open'}},'not_merged');
  deny({pr:{...pr,head:{...pr.head,sha:sha('c')}}},'source_revision_mismatch');
  deny({mainSha:sha('d')},'merge_not_current_main');
  deny({files:['sites/mall/app.js']},'no_education_changes');
});

test('Final approval remains required by the existing canonical Orchestrator receipt',()=>{
  const runner=read('scripts/education-release-continuity.mjs');
  const workflow=read('.github/workflows/education-release-continuity.yml');
  const deploy=read('.github/workflows/deploy-education.yml');
  assert.match(runner,/verifyOrchestratorReleaseReceipt\(branch/);
  assert.match(runner,/status\.statuses/);
  assert.match(runner,/no_education_changes/);
  assert.match(runner,/merge_commit_sha/);
  assert.match(runner,/event\.workflow_run/);
  assert.match(runner,/release_sha:decision\.mergeSha/);
  assert.doesNotMatch(runner,/wrangler\s+(deploy|publish)/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/EKODI Orchestrated PR Convergent Merge/);
  assert.match(workflow,/ref: main/);
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(deploy,/release_branch_ref:/);
  assert.match(deploy,/release_task_id:/);
  assert.match(deploy,/release_sha:/);
  assert.match(deploy,/Confirm final-approved merged release provenance/);
  assert.match(deploy,/scripts\/preflight-merged-release\.mjs/);
  assert.match(deploy,/REQUESTED_SHA.*GITHUB_SHA/);
  assert.match(deploy,/gh api "repos\/\$GITHUB_REPOSITORY\/commits\/\$GITHUB_SHA\/pulls"/);
  assert.match(deploy,/EKODI_RELEASE_BRANCH_REF/);
  assert.match(deploy,/Validate AI bootcamp native verification harness/);
  assert.match(deploy,/EKODI AI Orchestration Gate/);
  assert.match(deploy,/guarded-worker-release\.mjs/);
  assert.match(deploy,/Verify real Education production hostname/);
  assert.match(deploy,/Verify actual Education classroom on desktop and mobile/);
});

test('EKODI-native Chromium acceptance targets registered service with no persistent user browser',()=>{
  assert.equal(ORIGIN,'https://edu.ekodi.kr');
  assert.equal(ROUTE,'/study/ai-bootcamp/');
  assert.deepEqual(VIEWPORTS.map(p=>p.width),[320,390,768,1366,1440]);
  const script=read('scripts/verify-education-bootcamp-native.mjs');
  assert.match(script,/EKODI_SERVICE_MANIFEST/);
  assert.match(script,/chromium\.launch\(\{headless:true\}\)/);
  assert.match(script,/browser\.newContext/);
  assert.doesNotMatch(script,/launchPersistentContext|userDataDir|connectOverCDP/);
  assert.match(script,/if\(!\['GET','HEAD','OPTIONS'\]\.includes\(method\)\)/);
  assert.match(script,/await context\.close/);
  assert.match(script,/await browser\?\.close/);
  assert.match(script,/slideCounts/);
  assert.match(script,/artifacts\/education-native/);
  assert.match(script,/blockedMutations/);
  assert.match(script,/httpErrors/);
  assert.match(script,/requestFailures/);
  for(const p of ['scripts/education-release-continuity.mjs','scripts/verify-education-bootcamp-native.mjs']){
    execFileSync(process.execPath,['--check',fileURLToPath(new URL('../'+p,import.meta.url))],{stdio:'pipe'});
  }
});
