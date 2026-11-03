import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrivateReleaseTestDb } from './private-release-sqlite-test-support.mjs';
import { verifyPrivatePublisherRelease } from '../publishing/human/private-publisher-release-authority.js';

const D='sha256:'+'a'.repeat(64);
const NOW='2026-10-30T12:00:00.000Z';
const PUB='pub-jubilee-001', EDITION='edition-jubilee-001';
function releaseRecord() {
  return {
    editionId:EDITION,publicationId:PUB,title:'출판 승인된 도서',
    authorId:'author-publisher-01',releaseDigest:D,
    state:'released',visibility:'public',checkoutEnabled:true,
    createdAt:'2026-10-27T00:00:00.000Z',releasedAt:'2026-10-29T12:00:00.000Z',
    publishAt:'2026-10-29T12:00:00.000Z',releaseEventKey:'human-release:approved-v1',
    revision:8,
    channels:{books:{prepared:true,activated:true},ekodimall:{prepared:true,activated:true}},
  };
}
const rights=(digest=D)=>({trustedBackend:true,authorSignatureValid:true,
  publisherSignatureValid:true,assetDigestValid:true,rightsEvidenceValid:true,digest});
const author=()=>({
  ...releaseRecord(),
  authorApproval:{approvedBy:'author-publisher-01',approvedAt:'2026-10-27T00:00:00.000Z',digest:D},
  publisherApproval:{approvedBy:'publisher-01',approvedAt:'2026-10-28T00:00:00.000Z',digest:D},
});
const request=(channel='books')=>({publicationId:PUB,editionId:EDITION,releaseDigest:D,channel});
const caller=ch=>({verifiedService:ch});
function context(db) {
  return {
    PUBLISHING_PRIVATE_RELEASE_ENABLED:'true',
    PUBLISHING_RELEASE_DB:db,
    PUBLISHING_RELEASE_AUTH:{verifyServiceCaller:async(ctx,{channel})=>({
      authorized:ctx?.verifiedService===channel,serviceId:ctx?.verifiedService})},
    PUBLISHING_RELEASE_VERIFIER:{
      loadCandidate:async()=>author(),
      verifyApprovalEvidence:async()=>rights(),
    },
  };
}
async function write(db,r){
  const time=NOW;
  return db.prepare(`INSERT INTO publishing_private_editions (
    edition_id,publication_id,author_id,title,release_digest,state,visibility,
    checkout_enabled,publish_at_utc,revision,record_json,created_at_utc,updated_at_utc
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(r.editionId,r.publicationId,r.authorId,r.title,r.releaseDigest,
      r.state,r.visibility,r.checkoutEnabled?1:0,r.publishAt,r.revision,
      JSON.stringify(r),r.createdAt,time).run();
}
async function update(db,r) {
  await db.prepare(`UPDATE publishing_private_editions SET record_json=?,state=?,
    visibility=?,checkout_enabled=?,revision=? WHERE edition_id=?`)
    .bind(JSON.stringify(r),r.state,r.visibility,r.checkoutEnabled?1:0,
      r.revision,EDITION).run();
}
test('only service-authenticated bookstore and mall callers get exact release proof',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await write(db,releaseRecord());
    const env=context(db);
    for(const ch of ['books','ekodimall']){
      const result=await verifyPrivatePublisherRelease(env,request(ch),caller(ch),NOW);
      assert.deepEqual(result,{authorized:true,state:'released',visibility:'public',
        checkoutEnabled:true,channel:ch,publicationId:PUB,editionId:EDITION,
        releaseDigest:D});
    }
    assert.equal((await verifyPrivatePublisherRelease(env,request('books'),caller('ekodimall'),NOW)).authorized,false);
    assert.equal((await verifyPrivatePublisherRelease(env,request('books'),null,NOW)).authorized,false);
  }finally{db.close();}
});
test('not-before-schedule and single-store partial activation remain private',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await write(db,releaseRecord());
    const env=context(db);
    assert.equal((await verifyPrivatePublisherRelease(env,request(),caller('books'),
      '2026-10-29T11:59:00.000Z')).authorized,false);
    const r=releaseRecord();r.channels.ekodimall.activated=false;r.revision++;
    await update(db,r);
    assert.equal((await verifyPrivatePublisherRelease(env,request(),caller('books'),NOW)).authorized,false);
  }finally{db.close();}
});
test('approval revocation, digest mismatch, invalid state and no private DB fail closed',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await write(db,releaseRecord());
    const env=context(db);
    const no=async(e=env,q=request())=>(await verifyPrivatePublisherRelease(e,q,caller('books'),NOW)).authorized;
    assert.equal(await no({...env,PUBLISHING_PRIVATE_RELEASE_ENABLED:'false'}),false);
    assert.equal(await no({...env,PUBLISHING_RELEASE_DB:null}),false);
    assert.equal(await no({...env,PUBLISHING_RELEASE_AUTH:null}),false);
    assert.equal(await no(env,{...request(),releaseDigest:'sha256:'+'b'.repeat(64)}),false);
    assert.equal(await no({...env,PUBLISHING_RELEASE_VERIFIER:{
      ...env.PUBLISHING_RELEASE_VERIFIER,verifyApprovalEvidence:async()=>rights('sha256:'+'b'.repeat(64))}}),false);
    assert.equal(await no({...env,PUBLISHING_RELEASE_VERIFIER:{
      ...env.PUBLISHING_RELEASE_VERIFIER,verifyApprovalEvidence:async()=>({...rights(),rightsEvidenceValid:false})}}),false);
    assert.equal(await no({...env,PUBLISHING_RELEASE_VERIFIER:{
      ...env.PUBLISHING_RELEASE_VERIFIER,loadCandidate:async()=>({...author(),authorApproval:{...author().authorApproval,digest:'sha256:bad'}})}}),false);
    assert.equal(await no({...env,PUBLISHING_RELEASE_VERIFIER:{
      ...env.PUBLISHING_RELEASE_VERIFIER,verifyApprovalEvidence:async()=>{throw Error('offline');}}}),false);
    const r=releaseRecord();r.state='cancelled';r.visibility='private';r.checkoutEnabled=false;
    r.revision++;await update(db,r);
    assert.equal(await no(),false);
  }finally{db.close();}
});
test('any version change during rights verification invalidates the in-flight response',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await write(db,releaseRecord());
    const env=context(db);
    env.PUBLISHING_RELEASE_VERIFIER.verifyApprovalEvidence=async()=>{
      const r=releaseRecord();r.revision++;
      await update(db,r);return rights();
    };
    assert.equal((await verifyPrivatePublisherRelease(env,request(),caller('books'),NOW)).authorized,false);
  }finally{db.close();}
});
test('invalid claim, missing title and malformed clock are never exposed',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await write(db,releaseRecord());
    const env=context(db);
    assert.equal((await verifyPrivatePublisherRelease(env,request('search'),caller('search'),NOW)).authorized,false);
    assert.equal((await verifyPrivatePublisherRelease(env,{...request(),editionId:'../bad'},caller('books'),NOW)).authorized,false);
    assert.equal((await verifyPrivatePublisherRelease(env,request(),caller('books'),'fake date')).authorized,false);
    assert.equal((await verifyPrivatePublisherRelease({...env,PUBLISHING_RELEASE_VERIFIER:{
      ...env.PUBLISHING_RELEASE_VERIFIER,loadCandidate:async()=>({...author(),title:'changed title'})}},
      request(),caller('books'),NOW)).authorized,false);
  }finally{db.close();}
});
