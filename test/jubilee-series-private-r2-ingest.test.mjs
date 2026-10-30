import test from 'node:test';
import assert from 'node:assert/strict';
import { stageReview9IntoPrivateR2 } from '../publishing/jubilee-series/private-r2-ingest.mjs';
const sha=async bytes=>Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const enc=s=>new TextEncoder().encode(s);
async function fixture(){
  const source=new Map();
  for(const n of ['01','02'])for(const ext of ['docx','epub','pdf'])
    source.set('editions/'+n+'/test.'+ext,enc('confidential '+n+' '+ext));
  for(const name of ['editorial/notes.md','editorial/quality.json','editorial/footnotes.md'])
    source.set(name,enc('report '+name));
  const records=[];
  for(const [path,data] of source)records.push({path,bytes:data.byteLength,
    sha256:await sha(data),kind:path.split('.').at(-1)});
  const manifest={schemaVersion:1,packageType:'ekodi-private-editorial-ingest',
    seriesId:'EKODI-JUBILEE-THEOLOGY',sourceRevision:'review-9',
    packageStatus:'handoff-file-ready-not-yet-ingested',fileDigests:records,
    privateIngress:{registeredInEKODIPublisherR2:false,
      registeredInEKODIPublisherDB:false,verifiedStorageReadback:false,
      authorApproval:false,publisherApproval:false,publicCatalog:false,
      checkoutEnabled:false,releaseDate:null,priceKrw:null,ISBN:null}};
  const raw=enc(JSON.stringify(manifest));
  const expected={seriesId:manifest.seriesId,sourceRevision:'review-9',
    handoffId:'EJT-20261030-REVIEW9-PRIVATE-HANDOFF',
    artifactPackage:{manifestSha256:await sha(raw)},
    volumeAssets:['01','02'].map(n=>({
      reviewId:'EJT-'+n+'-REVIEW',
      docxSha256:records.find(x=>x.path==='editions/'+n+'/test.docx').sha256,
      epubSha256:records.find(x=>x.path==='editions/'+n+'/test.epub').sha256,
      pdfSha256:records.find(x=>x.path==='editions/'+n+'/test.pdf').sha256,
    }))};
  const memory=new Map(),puts=[];
  const r2={
    async put(k,b,opts){
      puts.push({k,opts});
      if(memory.has(k))return null;
      memory.set(k,new Uint8Array(b).slice());
      return {key:k};
    },
    async get(k){
      const data=memory.get(k);
      return data?{arrayBuffer:async()=>data.slice().buffer}:null;
    },
  };
  const aud=[];
  const env={PUBLISHING_PRIVATE_ASSETS:r2,
    PUBLISHING_INGEST_AUTH:{
      verifyServiceCaller:async ctx=>(ctx?.trusted===true?
        {authorized:true,serviceId:'publisher-private-ingestion',actorId:'editor-private-01'}:
        {authorized:false})},
    PUBLISHING_INGEST_RECEIPTS:{
      persistReadbackReceipt:async v=>{
        aud.push(v);
        return {persisted:true,handoffId:v.handoffId,
          manifestSha256:v.manifestSha256,revision:v.sourceRevision,
          objectCount:v.objects.length,auditId:'audit-private-001'};
      },
    },
  };
  return {env,source,raw,expected,memory,puts,aud,
    params:{env,callerContext:{trusted:true},expected,manifestBytes:raw,
      readAsset:async p=>source.get(p)}};
}
test('nine private R2 objects only become ingested after hash readback and audit',async()=>{
  const f=await fixture();
  const r=await stageReview9IntoPrivateR2(f.params);
  assert.equal(r.objectCount,9);
  assert.equal(r.stage,'private-editorial-ingested');
  assert.equal(r.privateR2ReadbackVerified,true);
  assert.equal(r.privatePublisherDbReceiptVerified,true);
  assert.equal(r.publicCatalog,false);
  assert.equal(r.checkoutEnabled,false);
  assert.equal(f.puts.length,9);
  assert.ok(f.puts.every(x=>x.opts.onlyIf.etagDoesNotMatch==='*' &&
    x.k.startsWith('private/editorial/')));
  assert.equal(f.aud.length,1);
  assert.equal(f.aud[0].authorApproved,false);
  assert.equal(f.aud[0].objects.length,9);
});
test('safe retry keeps the existing immutable bytes and verifies readback',async()=>{
  const f=await fixture();
  await stageReview9IntoPrivateR2(f.params);
  await stageReview9IntoPrivateR2(f.params);
  assert.equal(f.memory.size,9);
  assert.equal(f.puts.length,18);
});
test('nonpublisher caller and unconfigured environment are blocked before writes',async()=>{
  const f=await fixture();
  await assert.rejects(stageReview9IntoPrivateR2({
    ...f.params,callerContext:{trusted:false}}),/publisher-principal-not-verified/);
  await assert.rejects(stageReview9IntoPrivateR2({
    ...f.params,env:{}}),/private-bindings-not-configured/);
  assert.equal(f.puts.length,0);
});
test('changing manifest or individual manuscript bytes cannot be ingested',async()=>{
  const f=await fixture();
  const altered=enc(new TextDecoder().decode(f.raw)+' ');
  await assert.rejects(stageReview9IntoPrivateR2({
    ...f.params,manifestBytes:altered}),/manifest-digest/);
  const key='editions/01/test.epub';
  f.source.set(key,enc('different ebook'));
  await assert.rejects(stageReview9IntoPrivateR2(f.params),/source-sha256/);
  assert.equal(f.aud.length,0);
});
test('R2 readback tamper and durable receipt outage do not return ingested state',async()=>{
  const f=await fixture();
  const r2=f.env.PUBLISHING_PRIVATE_ASSETS;
  f.env.PUBLISHING_PRIVATE_ASSETS={...r2,
    async get(k){return {arrayBuffer:async()=>enc('corrupt object').buffer};}};
  await assert.rejects(stageReview9IntoPrivateR2(f.params),/readback-sha256/);
  assert.equal(f.aud.length,0);
  f.env.PUBLISHING_PRIVATE_ASSETS=r2;
  f.env.PUBLISHING_INGEST_RECEIPTS.persistReadbackReceipt=async()=>({
    persisted:false});
  await assert.rejects(stageReview9IntoPrivateR2(f.params),
    /transactional-ingest-receipt-missing/);
});
test('manifest public approval flags and edition digest mismatch are forbidden',async()=>{
  const f=await fixture();
  const m=JSON.parse(new TextDecoder().decode(f.raw));
  m.privateIngress.checkoutEnabled=true;
  f.params.manifestBytes=enc(JSON.stringify(m));
  f.expected.artifactPackage.manifestSha256=await sha(f.params.manifestBytes);
  await assert.rejects(stageReview9IntoPrivateR2(f.params),/premature-release-checkoutEnabled/);
  m.privateIngress.checkoutEnabled=false;
  f.params.manifestBytes=enc(JSON.stringify(m));
  f.expected.artifactPackage.manifestSha256=await sha(f.params.manifestBytes);
  f.expected.volumeAssets[0].epubSha256='a'.repeat(64);
  await assert.rejects(stageReview9IntoPrivateR2(f.params),/edition-digest-mismatch/);
});
