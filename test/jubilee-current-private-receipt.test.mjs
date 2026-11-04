import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrivateReleaseTestDb} from './private-release-sqlite-test-support.mjs';
import {persistCurrentJubileeReceipt} from '../publishing/jubilee-series/current-private-receipt.mjs';
const now='2026-11-04T11:42:00.000Z';
const handoffId='EJT-20261102-REVIEW9-10-A11Y-PRIVATE';
const files=[
  ['volume1/review9/manuscript.docx','review-9'],
  ['volume1/review9/reading.pdf','review-9'],
  ['volume1/review9/accessible.epub','review-9-a11y-20261102'],
  ['volume2/review10/manuscript.docx','review-10-editorial-candidate'],
  ['volume2/review10/reading.pdf','review-10-editorial-candidate'],
  ['volume2/review10/accessible.epub','review-10-editorial-a11y-candidate'],
];
const proposal=()=>({
  handoffId,seriesId:'EKODI-JUBILEE-THEOLOGY',
  sourceRevision:'review-9+review-10',manifestSha256:'a'.repeat(64),
  actorId:'publisher-private-agent',projectIds:{volume1:'project-01',volume2:'project-02'},
  objects:files.map(([path,edition],i)=>({
    path,edition,kind:path.split('.').at(-1),bytes:100+i,sha256:String(i+1).repeat(64),
    objectKey:'private/editorial/v2/'+handoffId+'/'+String(i+1).repeat(64)+'.'+path.split('.').at(-1),
  })),
  stage:'private-editorial-ingested',visibility:'private',
  authorApproved:false,publisherApproved:false,checkoutEnabled:false,
  publicCatalog:false,scheduledReleaseAt:null,
});
async function count(db,table){
  const q=await db.prepare('SELECT COUNT(*) AS n FROM '+table).bind().first();
  return q.n;
}
test('six-object private receipt and audit commit atomically then reread',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const v=proposal(),first=await persistCurrentJubileeReceipt(db,v,now);
    assert.equal(first.objectCount,6);
    assert.equal(first.revision,'review-9+review-10');
    assert.equal(await count(db,'publishing_private_current_receipts'),1);
    assert.equal(await count(db,'publishing_private_current_audit'),1);
    assert.deepEqual(await persistCurrentJubileeReceipt(db,v,now),first);
    assert.equal(await count(db,'publishing_private_current_audit'),1);
  }finally{db.close();}
});
test('conflicting project link or manifest cannot be rebound to old handoff',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const original=proposal();await persistCurrentJubileeReceipt(db,original,now);
    for(const changed of [
      {...original,manifestSha256:'b'.repeat(64)},
      {...original,projectIds:{volume1:'other-owner',volume2:'project-02'}},
    ])await assert.rejects(persistCurrentJubileeReceipt(db,changed,now),/conflicting-receipt/);
    assert.equal(await count(db,'publishing_private_current_receipts'),1);
  }finally{db.close();}
});
test('unexpected public flags, missing documents and no transaction are denied',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const original=proposal();
    for(const x of [
      {...original,authorApproved:true},
      {...original,checkoutEnabled:true},
      {...original,publicCatalog:true},
      {...original,objects:original.objects.slice(0,5)},
      {...original,projectIds:{volume1:'same-id',volume2:'same-id'}},
    ])await assert.rejects(persistCurrentJubileeReceipt(db,x,now),
      /PRIVATE_CURRENT_RECEIPT_REJECTED/);
    await assert.rejects(persistCurrentJubileeReceipt({prepare:db.prepare},
      original,now),/d1-batch-required/);
    assert.equal(await count(db,'publishing_private_current_receipts'),0);
  }finally{db.close();}
});
test('failed audit rolls back the receipt rather than reporting success',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const batch=db.batch;
    const broken={prepare:db.prepare,
      batch:async commands=>batch([commands[0],db.prepare(
        'INSERT INTO publishing_private_current_audit(audit_id) VALUES (NULL)').bind()])};
    await assert.rejects(persistCurrentJubileeReceipt(broken,proposal(),now));
    assert.equal(await count(db,'publishing_private_current_receipts'),0);
    assert.equal(await count(db,'publishing_private_current_audit'),0);
  }finally{db.close();}
});
