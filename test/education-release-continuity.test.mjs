import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  educationReleaseChanged,approvedEducationMerge,selectMergedEducationPRForConvergence,releaseQuotaBudget,
  latestEducationMergeFromGit,EDUCATION_LOCAL_PATHS
} from '../scripts/education-release-continuity.mjs';
import {ORIGIN,ROUTE,VIEWPORTS} from '../scripts/verify-education-bootcamp-native.mjs';
import {EKODI_SERVICE_MANIFEST} from '../ekodi-service-manifest.js';

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


test('Release quota preflight conservatively defers before scanning GitHub',()=>{
 assert.deepEqual(releaseQuotaBudget({resources:{core:{remaining:25}}}),{ok:true,remaining:25});
 assert.equal(releaseQuotaBudget({resources:{core:{remaining:0}}}).reason,'github_quota_low');
 assert.equal(releaseQuotaBudget({resources:{core:{remaining:23}}}).ok,false);
 assert.equal(releaseQuotaBudget({resources:{core:{remaining:24}}}).ok,true);
 assert.equal(releaseQuotaBudget({resources:{core:{remaining:null}}}).ok,false);
 assert.equal(releaseQuotaBudget({resources:{core:{remaining:-1}}}).reason,'quota_unknown');
 assert.equal(releaseQuotaBudget({resources:{}}).reason,'quota_unknown');
});
test('Read only bounded first-parent Education commit, not broad GitHub PR pagination',()=>{
 const calls=[];
 const found=latestEducationMergeFromGit({run:(cmd,args,opts)=>{
   calls.push({cmd,args,opts});return sha('a')+'\n';
 }});
 assert.equal(found,sha('a'));
 assert.equal(calls[0].cmd,'git');
 assert.deepEqual(calls[0].args.slice(0,5),['log','--first-parent','-1','--format=%H','--']);
 assert.equal(calls[0].args.includes('education/'),true);
 assert.equal(calls[0].args.includes('.github/workflows/deploy-education.yml'),true);
 assert.equal(EDUCATION_LOCAL_PATHS.includes('scripts/education-release-continuity.mjs'),true);
 assert.equal(latestEducationMergeFromGit({run:()=>'\n'}),'');
 assert.equal(latestEducationMergeFromGit({run:()=>sha('z')}),'');
});
test('Quota-limited continuity retains protected release and defers exhausted API',()=>{
 const runner=read('scripts/education-release-continuity.mjs');
 const workflow=read('.github/workflows/education-release-continuity.yml');
 assert.match(runner,/availableReleaseQuota\(token\)/);
 assert.match(runner,/GITHUB_QUOTA_DEFERRED/);
 assert.match(runner,/\/commits\/'\+mergedSha\+'\/pulls/);
 assert.match(runner,/no_unique_official_education_pr_for_latest_commit/);
 assert.doesNotMatch(runner,/\/pulls\?state=closed&base=main&sort=updated/);
 assert.match(workflow,/fetch-depth: 200/);
 assert.match(runner,/verifyEducationReleaseSnapshot/);
 assert.match(runner,/release_sha:releaseSha/);
});

test('select only exact official protected merged PR while old convergence SHA is stale',()=>{
 const branch='ai/chatgpt/orch_recovery_92640ebb79b88060e47ed32e9104581e';
 const base={number:7017,state:'closed',merged_at:'2026-10-30T05:07:51Z',
   base:{ref:'main'},head:{ref:branch,sha:sha('b')},merge_commit_sha:sha('c')};
 assert.deepEqual(selectMergedEducationPRForConvergence({pulls:[base],branch}),base);
 // A stale successful runner event may be on sha('a'): the actual merged
 // sha('b') must still pass the later source CI and canonical receipt.
 assert.equal(selectMergedEducationPRForConvergence({pulls:[base],branch}).head.sha,sha('b'));
 assert.equal(selectMergedEducationPRForConvergence({pulls:[base,base],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[{...base,merged_at:null}],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[{...base,state:'open'}],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[{...base,base:{ref:'develop'}}],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[{...base,head:{...base.head,ref:'ai/chatgpt/other'}}],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[{...base,head:{...base.head,sha:'bad'}}],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[{...base,merge_commit_sha:'bad'}],branch}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:[base],branch:'ai/chatgpt/unsafe'}),null);
 assert.equal(selectMergedEducationPRForConvergence({pulls:null,branch}),null);
 const runner=read('scripts/education-release-continuity.mjs');
 assert.match(runner,/selectMergedEducationPRForConvergence\(\{pulls,branch\}\)/);
 assert.match(runner,/convergence_head_advanced_before_protected_merge/);
 assert.doesNotMatch(runner,/pulls\.find\(p=>p\.head\?\.sha===run\.head_sha/);
 assert.match(runner,/verifyEducationReleaseSnapshot/);
 assert.match(runner,/receiptVerifier:verifyOrchestratorReleaseReceipt/);
 assert.match(runner,/required source status not successful/);
});

test('Legacy workflow_run decision accepts only its exact source on current main',()=>{
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
  assert.match(runner,/receiptVerifier:verifyOrchestratorReleaseReceipt/);
  assert.match(runner,/status\.statuses/);
  assert.match(runner,/no_education_changes/);
  assert.match(runner,/verifyEducationReleaseSnapshot/);
  assert.match(runner,/event\.workflow_run/);
  assert.match(runner,/release_sha:releaseSha/);
  assert.doesNotMatch(runner,/wrangler\s+(deploy|publish)/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/17 \* \* \* \*/);
  assert.match(workflow,/EKODI Orchestrated PR Convergent Merge/);
  assert.match(workflow,/ref: main/);
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(deploy,/release_branch_ref:/);
  assert.match(deploy,/release_task_id:/);
  assert.match(deploy,/release_sha:/);
  assert.match(deploy,/Confirm final-approved merged release provenance/);
  assert.match(deploy,/scripts\/preflight-merged-release\.mjs/);
  assert.match(deploy,/REQUESTED_SHA.*GITHUB_SHA/);
  assert.match(deploy,/node scripts\/verify-education-release-snapshot\.mjs/);
  assert.match(deploy,/EKODI_RELEASE_BRANCH_REF/);
  assert.match(deploy,/Validate AI bootcamp native verification harness/);
  assert.match(deploy,/EKODI AI Orchestration Gate/);
  assert.match(deploy,/guarded-worker-release\.mjs/);
  assert.match(deploy,/Verify real Education production hostname/);
  assert.match(deploy,/Verify actual Education classroom on desktop and mobile/);
});

test('EKODI-native Chromium acceptance targets registered service with no persistent user browser',()=>{
  assert.equal(ORIGIN,new URL(EKODI_SERVICE_MANIFEST.services.find(row=>row.id==='edu').url).origin);
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
