import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  NATIVE_JOB_REQUIREMENTS,projectNativeCutover,summarizeNativeCutover
} from '../scripts/ekodi-native-cutover-gate.mjs';

const sha='1234567890abcdef1234567890abcdef12345678',digest='a'.repeat(64);
const now=Date.parse('2026-10-30T03:00:00.000Z');
const utc='2026-10-30T02:45:00.000Z';
function fixture(jobId){
  const kinds=NATIVE_JOB_REQUIREMENTS[jobId].evidenceKinds;
  return {
    jobId,legacyState:'enabled',nowMs:now,
    nativeRun:{
      runId:1001,repository:'topmaster-joseph/ekodi-platform',
      owner:'EKODI Orchestrator',branch:'main',headSha:sha,
      event:'schedule',status:'completed',conclusion:'success',
      completedAt:utc,artifactBytes:2199,artifactExpired:false
    },
    receipts:kinds.map((kind,i)=>({
      jobId,kind,runId:1001,sourceSha:sha,verifiedBy:'EKODI Orchestrator',
      verificationId:'oidc-'+i,verifiedAt:utc,artifactDigest:digest,result:'passed'
    })),
    verifiedSources:kinds.map((_,i)=>'oidc-'+i).concat('human-verification','legacy-verification'),
    ownerApproval:{taskId:jobId,authority:'verified-human-gate',
      revision:sha,verificationId:'human-verification'},
    lease:{taskId:jobId,owner:'EKODI Orchestrator',generation:1,
      status:'exclusive',provenNoConcurrentLegacyWrite:true},
    legacyDisableReceipt:{
      taskId:jobId,platform:'chatgpt-automations',
      isEnabled:false,verifiedAt:utc,verificationId:'legacy-verification'
    }
  };
}
test('each job has different authoritative delivery requirements',()=>{
  assert.equal(Object.keys(NATIVE_JOB_REQUIREMENTS).length,4);
  assert.ok(NATIVE_JOB_REQUIREMENTS['church-weekly-worship'].evidenceKinds.includes('worship-google-slides'));
  assert.ok(NATIVE_JOB_REQUIREMENTS['human-publishing-editorial'].evidenceKinds.includes('epub-accessibility'));
  assert.ok(NATIVE_JOB_REQUIREMENTS['social-accounts-release'].evidenceKinds.includes('authenticated-social-ui-e2e'));
  assert.ok(NATIVE_JOB_REQUIREMENTS['church-live-release'].evidenceKinds.includes('anonymous-viewer-e2e'));
});
test('missing evidence blocks handoff and never disables legacy tasks',()=>{
  const r=projectNativeCutover({jobId:'human-publishing-editorial',nowMs:now});
  assert.equal(r.state,'handoff_blocked');
  assert.equal(r.cutoverAllowed,false);
  assert.equal(r.makesExternalChanges,false);
  assert.equal(r.canDisableLegacyTask,false);
  assert.ok(r.reasons.includes('native_run_not_verified'));
  assert.ok(r.reasons.some(x=>x.startsWith('missing:')));
});
test('monitoring-only readiness requires successful first-party run plus verified release and UI receipts',()=>{
  const v=fixture('social-accounts-release');
  assert.equal(projectNativeCutover(v).state,'eligible_for_separate_legacy_disable');
  assert.equal(projectNativeCutover(v).cutoverAllowed,true);
  assert.equal(projectNativeCutover({...v,receipts:v.receipts.slice(0,-1)}).cutoverAllowed,false);
  assert.equal(projectNativeCutover({...v,verifiedSources:[]}).cutoverAllowed,false);
  assert.equal(projectNativeCutover({...v,lease:null}).cutoverAllowed,false);
  assert.equal(projectNativeCutover({...v,nativeRun:{...v.nativeRun,artifactExpired:true}}).cutoverAllowed,false);
  assert.equal(projectNativeCutover({...v,nativeRun:{...v.nativeRun,branch:'test'}}).cutoverAllowed,false);
});
test('editorial and worship authoring require a separate human gate',()=>{
  for(const id of ['human-publishing-editorial','church-weekly-worship']){
    const v=fixture(id);
    assert.equal(projectNativeCutover(v).cutoverAllowed,true);
    assert.equal(projectNativeCutover({...v,ownerApproval:null}).cutoverAllowed,false);
    assert.equal(projectNativeCutover({...v,ownerApproval:{...v.ownerApproval,revision:'bad'}}).cutoverAllowed,false);
    assert.equal(projectNativeCutover({...v,receipts:v.receipts.filter(x=>!x.kind.includes('google'))}).cutoverAllowed,id!=='church-weekly-worship');
  }
});
test('an expired or unverified run never counts as current native delivery',()=>{
  const v=fixture('church-live-release');
  assert.equal(projectNativeCutover({...v,nativeRun:{...v.nativeRun,completedAt:'2026-10-12T01:00:00Z'}}).cutoverAllowed,false);
  assert.equal(projectNativeCutover({...v,nativeRun:{...v.nativeRun,conclusion:'failure'}}).cutoverAllowed,false);
  assert.equal(projectNativeCutover({...v,receipts:v.receipts.map(x=>({...x,sourceSha:'f'.repeat(40)}))}).cutoverAllowed,false);
});
test('cutover is confirmed only when independently verified legacy disable receipt also exists',()=>{
  const v=fixture('church-weekly-worship');
  assert.equal(projectNativeCutover({...v,legacyState:'disabled'}).state,'cutover_confirmed');
  assert.equal(projectNativeCutover({...v,legacyState:'disabled',legacyDisableReceipt:null}).state,'disabled_without_parity');
  assert.equal(projectNativeCutover({...v,legacyState:'disabled',verifiedSources:v.verifiedSources.filter(x=>x!=='legacy-verification')}).nativeOwned,false);
});
test('aggregate never reports all native until four confirmed task cutovers',()=>{
  const all=Object.keys(NATIVE_JOB_REQUIREMENTS).map(id=>projectNativeCutover({...fixture(id),legacyState:'disabled'}));
  assert.deepEqual(summarizeNativeCutover(all),{
    owner:'EKODI Orchestrator',legacyDisableActionsTaken:0,
    verifiedCutovers:4,readyButStillEnabled:0,blocked:0,allNative:true
  });
  assert.equal(summarizeNativeCutover(all.slice(0,3)).allNative,false);
});
test('module never reaches OpenAI APIs, payment, publication or task disable controls',async()=>{
  const s=await readFile(new URL('../scripts/ekodi-native-cutover-gate.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/fetch\(|https:\/\/chatgpt\.com|api\.openai\.com/);
  assert.doesNotMatch(s,/method:\s*['"](?:POST|PUT|DELETE)|automation\.update\(/);
  assert.match(s,/advisoryOnly:true/);
  assert.match(s,/canDisableLegacyTask:false/);
});
