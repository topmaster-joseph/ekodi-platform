import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePrivateReleaseTestDb } from './private-release-sqlite-test-support.mjs';
import { verifyBoundPublisherRelease } from '../publishing/human/publisher-release-rpc-service.js';

const digest='sha256:'+'f'.repeat(64);
const now='2026-10-30T06:10:00.000Z';
const release=()=>({
 editionId:'edition-jubilee-1',publicationId:'publication-jubilee-1',authorId:'author-1',
 title:'출판 승인된 검증용 도서',releaseDigest:digest,revision:6,
 state:'released',visibility:'public',checkoutEnabled:true,
 publishAt:'2026-10-30T05:00:00.000Z',releaseEventKey:'human-release:book-1',
 createdAt:'2026-10-29T05:00:00.000Z',releasedAt:'2026-10-30T05:10:00.000Z',
 channels:{books:{prepared:true,activated:true},ekodimall:{prepared:true,activated:true}},
});
const candidate=()=>({
 ...release(),priceKrw:9900,
 bookstore:{bookId:'BOOK-EKODI-NEW-003',catalogNo:'EB-NEW-003',author:'저자',fileKey:'BOOK-EKODI-NEW-003/ebook.epub'},
 authorApproval:{digest,approvedBy:'author-1',approvedAt:'2026-10-29T08:00:00.000Z'},
 publisherApproval:{digest,approvedBy:'publisher-1',approvedAt:'2026-10-29T09:00:00.000Z'},
});
const request=()=>({editionId:'edition-jubilee-1',publicationId:'publication-jubilee-1',releaseDigest:digest});
const evidence=()=>({trustedBackend:true,authorSignatureValid:true,publisherSignatureValid:true,
 rightsEvidenceValid:true,assetDigestValid:true,digest});
function fixture(){
 const db=makePrivateReleaseTestDb();
 const env={PUBLISHING_PRIVATE_RELEASE_ENABLED:'true',PUBLISHING_RELEASE_DB:db,
   PUBLISHING_RELEASE_VERIFIER:{
     loadCandidate:async()=>candidate(),verifyApprovalEvidence:async()=>evidence(),
   }};
 return {db,env,async register(){
   const r=release();
   await db.prepare(`INSERT INTO publishing_private_editions(
     edition_id,publication_id,author_id,title,release_digest,state,visibility,
     checkout_enabled,publish_at_utc,revision,record_json,created_at_utc,updated_at_utc)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(r.editionId,r.publicationId,r.authorId,r.title,
       r.releaseDigest,r.state,r.visibility,1,r.publishAt,r.revision,
       JSON.stringify(r),r.createdAt,now).run();
 },close:()=>db.close()};
}
test('two distinct RPC lanes authorize only their own public channel',async()=>{
 const f=fixture();try{
   await f.register();
   for(const ch of ['books','ekodimall']){
     const proof=await verifyBoundPublisherRelease(f.env,ch,request(),now);
     assert.deepEqual(proof,{authorized:true,channel:ch,state:'released',visibility:'public',
       checkoutEnabled:true,...request(),retailIdentityVersion:1,
       bookId:'BOOK-EKODI-NEW-003',catalogNo:'EB-NEW-003',title:release().title,
       author:'저자',fileKey:'BOOK-EKODI-NEW-003/ebook.epub',priceKrw:9900,currency:'KRW'});
   }
 }finally{f.close();}
});
test('service binding channel cannot be chosen by caller or browser JSON',async()=>{
 const f=fixture();try{
   await f.register();
   assert.equal((await verifyBoundPublisherRelease(f.env,'books',{
     ...request(),channel:'ekodimall',verifiedService:'books',approved:true},now)).authorized,false);
   assert.equal((await verifyBoundPublisherRelease(f.env,'ekodimall',{
     ...request(),channel:'books'},now)).authorized,false);
   assert.equal((await verifyBoundPublisherRelease(f.env,'anything',request(),now)).authorized,false);
   assert.equal((await verifyBoundPublisherRelease(f.env,'books',null,now)).authorized,false);
   assert.equal((await verifyBoundPublisherRelease(f.env,'books',{
     ...request(),releaseDigest:'sha256:'+'a'.repeat(64)},now)).authorized,false);
 }finally{f.close();}
});
test('missing env bindings, revoked rights, or pre-schedule clock fail closed',async()=>{
 const f=fixture();try{
   await f.register();
   assert.equal((await verifyBoundPublisherRelease({},'books',request(),now)).authorized,false);
   assert.equal((await verifyBoundPublisherRelease(f.env,'books',request(),
     '2026-10-30T04:59:59.000Z')).authorized,false);
   const bad={...f.env,PUBLISHING_RELEASE_VERIFIER:{
     ...f.env.PUBLISHING_RELEASE_VERIFIER,
     verifyApprovalEvidence:async()=>({...evidence(),rightsEvidenceValid:false})}};
   assert.equal((await verifyBoundPublisherRelease(bad,'books',request(),now)).authorized,false);
   const noData={...f.env,PUBLISHING_RELEASE_DB:{prepare(){throw Error('offline')}}};
   assert.equal((await verifyBoundPublisherRelease(noData,'books',request(),now)).authorized,false);
 }finally{f.close();}
});
test('production cannot accidentally expose RPC gate over the HTTP handler',async()=>{
 const entry=readFileSync(new URL('../publishing-release-entry.js',import.meta.url),'utf8');
 const wrangler=readFileSync(new URL('../wrangler.publishing.staging.toml',import.meta.url),'utf8');
 assert.match(entry,/class BooksPublisherReleaseGate extends WorkerEntrypoint/);
 assert.match(entry,/class MallPublisherReleaseGate extends WorkerEntrypoint/);
 assert.match(wrangler,/main = "publishing-release-entry.js"/);
 assert.match(wrangler,/PUBLISHING_PRIVATE_RELEASE_ENABLED = "false"/);
 assert.doesNotMatch(wrangler,/\[\[services\]\]/);
});

test('release RPC denies editions lacking signed product identity or price',async()=>{
 const f=fixture();try{
  await f.register();
  for(const invalid of [
    {...candidate(),bookstore:null},
    {...candidate(),priceKrw:0},
    {...candidate(),bookstore:{...candidate().bookstore,fileKey:'BOOK-EKODI-NEW-003/../other.epub'}},
    {...candidate(),bookstore:{...candidate().bookstore,catalogNo:''}},
  ]){
    const guard={...f.env,PUBLISHING_RELEASE_VERIFIER:{
      ...f.env.PUBLISHING_RELEASE_VERIFIER,loadCandidate:async()=>invalid,
    }};
    const proof=await verifyBoundPublisherRelease(guard,'books',request(),now);
    assert.equal(proof.authorized,false,'unbound product attributes must fail closed');
  }
 }finally{f.close();}
});
