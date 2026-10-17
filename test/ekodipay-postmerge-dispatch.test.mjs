import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyMergedPayRelease,PAY_RELEASE_FILES} from '../scripts/dispatch-ekodipay-postmerge.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const branch='ai/gpt6/orch_recovery_'+('3fb3b6f3ca681675009fe99a2b6e9f08');
const sha='de0ca90697c490580f1ed4b3a38545f992b02319';
const pr={
  merged_at:'2026-10-15T00:51:32Z',
  base:{ref:'main'},
  head:{ref:branch,sha},
};
test('only exact merged official-branch Pay source qualifies for dispatch',()=>{
 assert.equal(classifyMergedPayRelease({pr,files:['ekodipay-worker.js'],branch,sha}).eligible,true);
 for(const change of [
  {pr:{...pr,merged_at:null}},
  {pr:{...pr,base:{ref:'development'}}},
  {pr:{...pr,head:{ref:'ai/gpt6/not-official',sha}}},
  {sha:'0'.repeat(40)},
  {files:['site-worker.js']},
  {files:['docs/DOMAIN-NAMING.md']},
  {branch:'ai/gpt6/unapproved'}
 ]) {
  const value=classifyMergedPayRelease({pr,files:['ekodipay-worker.js'],branch,sha,...change});
  assert.equal(value.eligible,false,JSON.stringify(change));
 }
});
test('allowlist is scoped only to canonical Pay deploy, read-only audit and native verification',()=>{
 for(const file of PAY_RELEASE_FILES){
  assert.ok(file.includes('ekodipay')||file.includes('ekodi-pay'),file);
 }
 assert.ok(!PAY_RELEASE_FILES.has('wrangler.site.toml'));
 assert.ok(!PAY_RELEASE_FILES.has('.github/workflows/deploy-site-core.yml'));
});
test('merged Pay deploy requires signed dispatch and real money remains disabled',async()=>{
 const pay=await read('.github/workflows/deploy-ekodipay.yml');
 const audit=await read('.github/workflows/audit-ekodipay-legacy-ingress.yml');
 const converge=await read('.github/workflows/converge-orchestrated-pr-merge.yml');
 const hook=await read('scripts/dispatch-ekodipay-postmerge.mjs');
 assert.ok(pay.includes("github.event_name == 'workflow_dispatch'"));
 assert.ok(audit.includes("github.event_name == 'workflow_dispatch'"));
 for(const yml of [pay,audit]){
  assert.ok(yml.includes('EKODI_RELEASE_BRANCH_REF:'));
  assert.ok(yml.includes('EKODI_RELEASE_TASK_ID:'));
  assert.ok(yml.includes('node scripts/dispatch-ekodipay-postmerge.mjs --verify'));
  assert.ok(yml.includes('validate-ekodi-ai-change-orchestration.mjs'));
 }
 assert.ok(converge.includes('run: node scripts/converge-orchestrated-pr-merge.mjs'));
 assert.ok(converge.includes('run: node scripts/dispatch-ekodipay-postmerge.mjs'));
 assert.ok(hook.includes('verifyOrchestratorReleaseReceipt'));
 assert.ok(hook.includes('classifyMergedPayRelease'));
 assert.ok(!hook.includes('wrangler deploy'));
 assert.ok(!hook.includes('dns_records/'));
 const wrangler=await read('wrangler.ekodipay.toml');
 assert.ok(wrangler.includes('PAYMENT_EXECUTION_MODE = "disabled-until-approved"'));
});
