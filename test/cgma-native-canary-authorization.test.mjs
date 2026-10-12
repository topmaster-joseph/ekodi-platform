import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {CGMA_NATIVE_CANARY,inspectCgmaCanaryPayload,inspectCgmaCanaryReceipt} from '../cgma-native-canary-policy.js';

const u='123e4567-e89b-42d3-a456-426614174000';
const payload={origin:'https://ekodi.kr',boardId:'site:cgma:main',confirmed:true,grantRef:'cgma_grant_'+u,nonce:'cgma_'+u};
const receipt={
  taskId:'hyb_'+u,nonce:'cgma_'+u,origin:'https://ekodi.kr',
  boardId:'site:cgma:main',ownPostId:42,cleanedUp:true,
  userBrowserReused:false,clipboardAccessed:false,
  steps:[
    ['health',200],['anonymous-denial',403],['create',201],['read',200],
    ['edit',200],['read-edited',200],['delete',200],['read-deleted',404],['list-hidden',200],
  ].map(([name,httpStatus])=>({name,httpStatus,ok:true})),
  auditEvidenceRefs:['audit_aaaaaaaa','audit_bbbbbbbb','audit_cccccccc']
};

test('native write scope is fixed to CGMA, a single canary and a short lease',()=>{
  assert.equal(CGMA_NATIVE_CANARY.taskType,'board.cgma.authenticated-crud.verify');
  assert.equal(CGMA_NATIVE_CANARY.maxAttempts,1);
  assert.ok(CGMA_NATIVE_CANARY.maxLeaseMs<=120000);
  assert.equal(CGMA_NATIVE_CANARY.status,'delegation_not_configured');
  assert.equal(CGMA_NATIVE_CANARY.origin,'https://ekodi.kr');
  assert.equal(CGMA_NATIVE_CANARY.boardId,'site:cgma:main');
});

test('native canary grant requires affirmative consent and strict origin / board binding',()=>{
  assert.equal(inspectCgmaCanaryPayload(payload).ok,true);
  assert.equal(inspectCgmaCanaryPayload({...payload,origin:'https://example.org'}).code,'BOARD_SCOPE_INVALID');
  assert.equal(inspectCgmaCanaryPayload({...payload,confirmed:false}).code,'HUMAN_CONFIRMATION_REQUIRED');
  assert.equal(inspectCgmaCanaryPayload({...payload,nonce:'wrong'}).code,'NONCE_REQUIRED');
  assert.equal(inspectCgmaCanaryPayload({...payload,grantRef:'unauthorized'}).code,'AUTH_REQUIRED');
});

test('no browser tokens, cookies or arbitrary credentials may be transferred to a native job',()=>{
  for(const extra of [{authorization:'Bearer dangerous'},{cookies:'session=secret'},{session:{accessToken:'dangerous'}},{nested:{apiKey:'dangerous'}},{password:'x'}]){
    assert.equal(inspectCgmaCanaryPayload({...payload,...extra}).ok,false);
  }
});

test('receipt is only structurally valid with exact nine steps, own cleanup and audit references',()=>{
  assert.equal(inspectCgmaCanaryReceipt(receipt).code,'STRUCTURAL_RECEIPT_VALID_ONLY');
  assert.equal(inspectCgmaCanaryReceipt({...receipt,cleanedUp:false}).code,'ISOLATION_OR_CLEANUP_UNVERIFIED');
  assert.equal(inspectCgmaCanaryReceipt({...receipt,auditEvidenceRefs:[]}).code,'AUTHORITATIVE_AUDIT_EVIDENCE_REQUIRED');
  assert.equal(inspectCgmaCanaryReceipt({...receipt,steps:receipt.steps.slice(0,8)}).code,'RECEIPT_STEPS_INCOMPLETE');
  assert.equal(inspectCgmaCanaryReceipt({...receipt,steps:receipt.steps.map((s,i)=>i===6?{...s,httpStatus:500}:s)}).code,'RECEIPT_STEP_INVALID');
  assert.equal(inspectCgmaCanaryReceipt({...receipt,ownPostId:0}).code,'RECEIPT_IDENTITY_INVALID');
});

test('EKODI trusted hybrid queue rejects native write canary before creating jobs',async()=>{
  const source=await readFile(new URL('../hybrid-execution.js',import.meta.url),'utf8');
  const first=source.indexOf('if (taskType === CGMA_NATIVE_CANARY.taskType)');
  const creation=source.indexOf('INSERT INTO hybrid_execution_jobs',first);
  assert.ok(first>0&&creation>first);
  assert.match(source.slice(first,creation),/CGMA_NATIVE_WRITE_DELEGATION_NOT_CONFIGURED/);
  assert.match(source.slice(first,creation),/return json\(\{code:'AUTH_REQUIRED'/);
  assert.match(source,/requiredCapability:'cgmaBoardWriteCanary'|capability:'cgmaBoardWriteCanary'/);
  assert.doesNotMatch(source.slice(first,creation),/SET status='completed'/);
});
