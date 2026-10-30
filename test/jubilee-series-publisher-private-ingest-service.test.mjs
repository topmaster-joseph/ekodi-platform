import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrivateReleaseTestDb } from './private-release-sqlite-test-support.mjs';
import { ingestReview9ViaProtectedPublisherService } from '../publishing/jubilee-series/publisher-private-ingest-service.mjs';
const enc=s=>new TextEncoder().encode(s);
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))]
  .map(v=>v.toString(16).padStart(2,'0')).join('');
async function create(){
  const db=makePrivateReleaseTestDb(),objects=new Map(),stored=new Map();
  for(const n of ['01','02'])for(const e of ['docx','epub','pdf'])
    objects.set('editions/'+n+'/book.'+e,enc('private '+n+' '+e));
  for(const x of ['editorial/footnotes.md','editorial/qa.md','editorial/hashes.json'])
    objects.set(x,enc('editorial '+x));
  const files=[];
  for(const [path,body] of objects)
    files.push({path,sha256:await sha(body),bytes:body.byteLength,kind:path.split('.').at(-1)});
  const m={schemaVersion:1,packageType:'ekodi-private-editorial-ingest',
    seriesId:'EKODI-JUBILEE-THEOLOGY',sourceRevision:'review-9',
    packageStatus:'handoff-file-ready-not-yet-ingested',fileDigests:files,
    privateIngress:{
      registeredInEKODIPublisherR2:false,registeredInEKODIPublisherDB:false,
      verifiedStorageReadback:false,authorApproval:false,publisherApproval:false,
      publicCatalog:false,checkoutEnabled:false,releaseDate:null,priceKrw:null,ISBN:null}};
  const manifestBytes=enc(JSON.stringify(m));
  const expected={seriesId:m.seriesId,sourceRevision:'review-9',
    handoffId:'EJT-20261030-REVIEW9-PRIVATE-HANDOFF',
    artifactPackage:{manifestSha256:await sha(manifestBytes)},
    volumeAssets:['01','02'].map(n=>({
      reviewId:'EJT-'+n+'-REVIEW',
      ...Object.fromEntries(['docx','epub','pdf'].map(e=>
        [e+'Sha256',files.find(f=>f.path==='editions/'+n+'/book.'+e).sha256])),
    }))};
  const r2={
    async put(key,body,opts){
      if(stored.has(key))return null;
      if(opts?.onlyIf?.etagDoesNotMatch!=='*')throw Error('non-immutable write');
      stored.set(key,new Uint8Array(body).slice());
      return {key};
    },
    async get(key){
      const b=stored.get(key);
      return b?{arrayBuffer:async()=>b.slice().buffer}:null;
    },
  };
  const env={
    PUBLISHING_PRIVATE_INGEST_ENABLED:'true',
    PUBLISHING_PRIVATE_INGEST_DB:db,
    PUBLISHING_PRIVATE_ASSETS:r2,
    PUBLISHING_INGEST_AUTH:{
      verifyServiceCaller:async(ctx)=>ctx?.trusted===true?{
        authorized:true,serviceId:'publisher-private-ingestion',actorId:'editor-r2-01',
      }:{authorized:false},
    },
  };
  const args={callerContext:{trusted:true},expected,manifestBytes,
    readAsset:async path=>objects.get(path)};
  return {db,env,args,stored,close:()=>db.close()};
}
const count=async(db,t)=>(await db.prepare('SELECT COUNT(*) as n FROM '+t).bind().first()).n;
test('complete R2 and D1 private intake creates exactly one receipt + audit',async()=>{
 const f=await create();try{
   const x=await ingestReview9ViaProtectedPublisherService(f.env,f.args);
   assert.equal(x.stage,'private-editorial-ingested');
   assert.equal(x.privateR2ReadbackVerified,true);
   assert.equal(x.privatePublisherDbReceiptVerified,true);
   assert.equal(x.checkoutEnabled,false);
   assert.equal(f.stored.size,9);
   assert.equal(await count(f.db,'publishing_private_handoff_receipts'),1);
   assert.equal(await count(f.db,'publishing_private_handoff_audit'),1);
   const again=await ingestReview9ViaProtectedPublisherService(f.env,f.args);
   assert.equal(again.auditId,x.auditId);
   assert.equal(await count(f.db,'publishing_private_handoff_receipts'),1);
 }finally{f.close();}
});
test('disabled gate or unavailable DB never claims receipt',async()=>{
 const f=await create();try{
   f.env.PUBLISHING_PRIVATE_INGEST_ENABLED='false';
   await assert.rejects(ingestReview9ViaProtectedPublisherService(f.env,f.args),
     /feature-off/);
   assert.equal(f.stored.size,0);
   f.env.PUBLISHING_PRIVATE_INGEST_ENABLED='true';
   f.env.PUBLISHING_PRIVATE_INGEST_DB={prepare:f.db.prepare};
   await assert.rejects(ingestReview9ViaProtectedPublisherService(f.env,f.args),
     /private-db-unconfigured/);
 }finally{f.close();}
});
test('untrusted caller cannot write source assets to private bucket',async()=>{
 const f=await create();try{
   await assert.rejects(ingestReview9ViaProtectedPublisherService(f.env,{
     ...f.args,callerContext:{trusted:false}}),/publisher-principal-not-verified/);
   assert.equal(f.stored.size,0);
   assert.equal(await count(f.db,'publishing_private_handoff_receipts'),0);
 }finally{f.close();}
});
