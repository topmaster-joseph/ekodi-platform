import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrivateReleaseTestDb } from './private-release-sqlite-test-support.mjs';
import { persistPrivateReview9Receipt } from '../publishing/jubilee-series/private-ingest-receipt.mjs';
const AT='2026-10-30T17:00:00.000Z',SHA='f'.repeat(64);
function proposal(){
 const handoffId='EJT-20261030-REVIEW9-PRIVATE-HANDOFF';
 const objects=[];
 for(const n of ['01','02'])for(const ext of ['epub','pdf','docx']){
  const digest=(n==='01'?'a':'b').repeat(64);
  objects.push({path:'editions/'+n+'/book.'+ext,kind:ext,
    sha256:digest,bytes:100,
    objectKey:'private/editorial/'+handoffId+'/'+digest+'.'+ext});
 }
 for(const [i,ext] of ['md','json','md'].entries()){
  const digest=String(i+1).repeat(64);
  objects.push({path:'editorial/'+i+'.'+ext,kind:ext,sha256:digest,
    bytes:400,objectKey:'private/editorial/'+handoffId+'/'+digest+'.'+ext});
 }
 return {handoffId,seriesId:'EKODI-JUBILEE-THEOLOGY',
  sourceRevision:'review-9',manifestSha256:SHA,actorId:'private-editor-01',
  objects,stage:'private-editorial-ingested',visibility:'private',
  authorApproved:false,publisherApproved:false,
  publicCatalog:false,checkoutEnabled:false,scheduledReleaseAt:null};
}
const rows=async(db,table)=>(await db.prepare('SELECT * FROM '+table).bind().all()).results;
test('private receipt and audit are atomically persisted for nine readback objects',async()=>{
 const db=makePrivateReleaseTestDb();try{
  const first=proposal();
  const result=await persistPrivateReview9Receipt(db,first,AT);
  assert.deepEqual(result,{persisted:true,handoffId:first.handoffId,
    manifestSha256:SHA,revision:'review-9',objectCount:9,
    auditId:first.handoffId+':ingest-audit-v1'});
  assert.equal((await rows(db,'publishing_private_handoff_receipts')).length,1);
  assert.equal((await rows(db,'publishing_private_handoff_audit')).length,1);
  const second=await persistPrivateReview9Receipt(db,first,AT);
  assert.deepEqual(second,result);
  assert.equal((await rows(db,'publishing_private_handoff_audit')).length,1);
 }finally{db.close();}
});
test('different manifest/reviewer for existing handoff is denied without modification',async()=>{
 const db=makePrivateReleaseTestDb();try{
  const original=proposal();
  await persistPrivateReview9Receipt(db,original,AT);
  await assert.rejects(persistPrivateReview9Receipt(db,{
    ...original,manifestSha256:'a'.repeat(64)},AT),/conflicting-ingest-receipt/);
  assert.equal((await rows(db,'publishing_private_handoff_receipts')).length,1);
  assert.equal((await rows(db,'publishing_private_handoff_audit')).length,1);
 }finally{db.close();}
});
test('spoofed public-release flags or missing one document are never receipted',async()=>{
 const db=makePrivateReleaseTestDb();try{
  const original=proposal();
  for(const forged of [
   {...original,authorApproved:true},
   {...original,checkoutEnabled:true},
   {...original,publicCatalog:true},
   {...original,objects:original.objects.slice(0,8)},
   {...original,scheduledReleaseAt:'2026-11-01T00:00:00.000Z'},
  ]){
   await assert.rejects(persistPrivateReview9Receipt(db,forged,AT),
     /PRIVATE_INGEST_RECEIPT_REJECTED/);
  }
  assert.equal((await rows(db,'publishing_private_handoff_receipts')).length,0);
 }finally{db.close();}
});
test('no D1 batch means no state change and no false success receipt',async()=>{
 const db=makePrivateReleaseTestDb();try{
  await assert.rejects(persistPrivateReview9Receipt({prepare:db.prepare},
    proposal(),AT),/d1-batch-required/);
  assert.equal((await rows(db,'publishing_private_handoff_audit')).length,0);
 }finally{db.close();}
});
test('database failure rolls back receipt and audit',async()=>{
 const db=makePrivateReleaseTestDb();try{
  const noAudit=db.batch;
  const broken={prepare:db.prepare,
    batch:async stmts=>noAudit([stmts[0],db.prepare(
      "INSERT INTO publishing_private_handoff_audit(audit_id) VALUES (NULL)").bind()])};
  await assert.rejects(persistPrivateReview9Receipt(broken,proposal(),AT));
  assert.equal((await rows(db,'publishing_private_handoff_receipts')).length,0);
  assert.equal((await rows(db,'publishing_private_handoff_audit')).length,0);
 }finally{db.close();}
});
