import test from 'node:test';
import assert from 'node:assert/strict';
import {stageCurrentJubileeIntoPrivateR2} from '../publishing/jubilee-series/current-private-intake.mjs';
const files=[
  ['volume1/review9/manuscript.docx','review-9'],
  ['volume1/review9/reading.pdf','review-9'],
  ['volume1/review9/accessible.epub','review-9-a11y-20261102'],
  ['volume2/review10/manuscript.docx','review-10-editorial-candidate'],
  ['volume2/review10/reading.pdf','review-10-editorial-candidate'],
  ['volume2/review10/accessible.epub','review-10-editorial-a11y-candidate'],
];
const enc=s=>new TextEncoder().encode(s);
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))]
  .map(b=>b.toString(16).padStart(2,'0')).join('');
async function fixture(){
  const source=new Map(),stored=new Map(),puts=[],aud=[];
  const primaryFiles=[];
  for(const [path,edition] of files){
    const data=enc('private test content: '+path);
    source.set('current/'+path,data);
    primaryFiles.push({path,edition,sha256:await sha(data),bytes:data.byteLength});
  }
  const manifest={
    series:'에코디 희년신학 시리즈',
    status:'EDITORIAL_AND_AUTOMATED_CHECKS_COMPLETE__AUTHENTICATED_REGISTRATION_PENDING',
    projectIds:{volume1:null,volume2:null},
    publisherIngestCompleted:false,authorFinalApproval:false,
    publisherFinalApproval:false,publicOrSaleEnabled:false,
    primaryFiles,
  };
  const manifestBytes=enc(JSON.stringify(manifest));
  const expected={
    schemaVersion:2,seriesId:'EKODI-JUBILEE-THEOLOGY',
    handoffId:'EJT-20261102-REVIEW9-10-A11Y-PRIVATE',
    artifactPackage:{manifestSha256:await sha(manifestBytes)},
    primaryFiles,release:{authorApproved:false,publisherApproved:false,
      publicCatalog:false,checkoutEnabled:false,saleAllowed:false,
      priceKrw:null,isbn:null},
  };
  const env={
    PUBLISHING_PRIVATE_ASSETS:{
      async put(k,b,opts){
        puts.push({k,opts});
        if(!stored.has(k))stored.set(k,new Uint8Array(b).slice());
        return {key:k};
      },
      async get(k){
        const v=stored.get(k);
        return v?{arrayBuffer:async()=>v.slice().buffer}:null;
      },
    },
    PUBLISHING_INGEST_AUTH:{verifyServiceCaller:async ctx=>
      ctx?.trusted===true?{authorized:true,serviceId:'publisher-private-ingestion',actorId:'editor-01'}:
        {authorized:false}},
    PUBLISHING_INGEST_RECEIPTS:{persistReadbackReceipt:async proposal=>{
      aud.push(proposal);return {persisted:true,handoffId:proposal.handoffId,
        manifestSha256:proposal.manifestSha256,revision:proposal.sourceRevision,
        objectCount:proposal.objects.length,auditId:'audit-01'};
    }},
  };
  const args={env,callerContext:{trusted:true},expected,manifestBytes,
    projectIds:{volume1:'project-01',volume2:'project-02'},
    readAsset:async path=>source.get(path)};
  return {args,env,source,stored,puts,aud,manifest};
}
test('current review-9 and review-10 editions read back six private objects',async()=>{
  const x=await fixture();
  const result=await stageCurrentJubileeIntoPrivateR2(x.args);
  assert.equal(result.objectCount,6);
  assert.equal(result.privateR2ReadbackVerified,true);
  assert.equal(result.privatePublisherDbReceiptVerified,true);
  assert.equal(result.checkoutEnabled,false);
  assert.equal(result.authorApproved,false);
  assert.equal(x.puts.length,6);
  assert.equal(x.aud.length,1);
  assert.ok(x.puts.every(a=>a.k.startsWith('private/editorial/v2/')&&
    a.opts.onlyIf.etagDoesNotMatch==='*'));
  await stageCurrentJubileeIntoPrivateR2(x.args);
  assert.equal(x.stored.size,6);
});
test('nonpublisher, no private project links or disabled bindings are denied',async()=>{
  const x=await fixture();
  await assert.rejects(stageCurrentJubileeIntoPrivateR2({
    ...x.args,callerContext:{trusted:false}}),/publisher-identity/);
  await assert.rejects(stageCurrentJubileeIntoPrivateR2({
    ...x.args,projectIds:{}}),/verified-project-link-required/);
  await assert.rejects(stageCurrentJubileeIntoPrivateR2({
    ...x.args,env:{}}),/private-service-bindings/);
  assert.equal(x.puts.length,0);
});
test('a corrupt sixth file cannot cause partial private storage writes',async()=>{
  const x=await fixture();
  x.source.set('current/volume2/review10/accessible.epub',enc('tampered'));
  await assert.rejects(stageCurrentJubileeIntoPrivateR2(x.args),/source-byte-sha256/);
  assert.equal(x.puts.length,0);
});
test('stale manifest and forged release status cannot pass pinned intake',async()=>{
  const x=await fixture();
  const altered=enc(JSON.stringify({...x.manifest,publisherFinalApproval:true}));
  await assert.rejects(stageCurrentJubileeIntoPrivateR2({
    ...x.args,manifestBytes:altered}),/manifest-sha256/);
  x.args.manifestBytes=altered;
  x.args.expected.artifactPackage.manifestSha256=await sha(altered);
  await assert.rejects(stageCurrentJubileeIntoPrivateR2(x.args),/unapproved-source-only/);
  assert.equal(x.puts.length,0);
});
test('R2 mismatch or forged receipt never creates an ingested success',async()=>{
  const x=await fixture();
  x.env.PUBLISHING_PRIVATE_ASSETS.get=async()=>({arrayBuffer:async()=>enc('corrupt').buffer});
  await assert.rejects(stageCurrentJubileeIntoPrivateR2(x.args),/private-readback-mismatch/);
  assert.equal(x.aud.length,0);
  const y=await fixture();
  y.env.PUBLISHING_INGEST_RECEIPTS.persistReadbackReceipt=async()=>({persisted:false});
  await assert.rejects(stageCurrentJubileeIntoPrivateR2(y.args),/durable-audit-readback-required/);
});
