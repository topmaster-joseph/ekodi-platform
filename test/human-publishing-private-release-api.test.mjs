import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handlePrivateReleaseAdmin } from '../publishing/human/private-release-api.js';

const DIGEST='sha256:'+'e'.repeat(64);
const ENDPOINT='https://ekodi.kr/api/publishing/private-releases';
const truth=keys=>Object.fromEntries(keys.map(k=>[k,true]));
const candidate=()=>({
  publicationId:'PRIVATE-BOOK-001',editionId:'PRIVATE-EDITION-001',
  title:'권리 검수 완료된 비공개 도서',authorId:'AUTHOR-001',releaseDigest:DIGEST,
  fieldId:'humanities',collectionId:'general-theology',priceKrw:9900,
  format:'epub',readerProfiles:['general'],
  rights:truth(['licenseChecked','authorContractApproved']),
  originality:truth(['provenanceReviewed','verifiedNoUnauthorizedImitation']),
  craft:truth(['realHumanExperienceReviewed','characterAndMotivationReviewed',
    'logicAndContinuityReviewed','readerFeedbackReviewed','editorialRevisionComplete']),
  truth:truth(['claimsAndCitationsVerified','sensitiveClaimsReviewed']),
  graphics:truth(['assetRightsChecked','visualNarrativeReviewed','altTextComplete']),
  accessibility:truth(['epubCheckPassed','acePassed','accessibilityMetadataReady',
    'logicalReadingOrder','semanticNavigation','mobileReflowVerified',
    'contrastVerified','screenReaderVerified','keyboardNavigationVerified']),
  legal:truth(['identifierRequirementsVerified','bookPricePolicyVerified','digitalConsumerTermsReviewed']),
  commerce:truth(['signedEditionAssetReady','booksChannelConfigured',
    'mallChannelConfigured','paymentAndEntitlementValidated']),
  publisherApproval:{approvedBy:'PUBLISHER-001',approvedAt:'2026-10-29T09:00:00+09:00',digest:DIGEST},
  authorApproval:{approvedBy:'AUTHOR-001',approvedAt:'2026-10-29T09:00:00+09:00',digest:DIGEST},
});
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../publishing/human/sql/001_private_scheduled_editions.sql',import.meta.url),'utf8'));
  const adapt={prepare(sql){const statement=db.prepare(sql);return{
    bind(...values){return{
      run:async()=>({meta:{changes:Number(statement.run(...values).changes)}}),
      first:async()=>statement.get(...values)||null,
      all:async()=>({results:statement.all(...values)}),
    }},
  }}};
  const changes=[];
  const env={
    PUBLISHING_PRIVATE_RELEASE_ENABLED:'true',
    PUBLISHING_RELEASE_DB:adapt,
    PUBLISHING_RELEASE_AUTH:{verifyRequest:async(request,{capability,requiresCsrf})=>({
      authorized:true,subjectId:'staff-publisher-001',csrfVerified:!requiresCsrf ||
        request.headers.get('x-ekodi-csrf')==='verified-value',capability,
    }),issueCsrf:async ({subjectId})=>({subjectId,value:'0123456789abcdef0123456789abcdef01234567',expiresAt:'2099-01-01T00:00:00Z'})},
    PUBLISHING_RELEASE_AUTH_ISSUER:{},
    PUBLISHING_RELEASE_VERIFIER:{
      loadCandidate:async id=>id==='PRIVATE-EDITION-001'?candidate():null,
      verifyCompletedFile:async record=>({
        trustedBackend:true,privateFileVerified:true,
        editorialCompleteVerified:true,artifactDigest:record.releaseDigest,
      }),
      verifyApprovalEvidence:async(record)=>({
        trustedBackend:true,authorSignatureValid:true,publisherSignatureValid:true,
        rightsEvidenceValid:true,assetDigestValid:true,digest:record.releaseDigest,
      }),
    },
    PUBLISHING_RELEASE_AUDIT:{record:async message=>{
      changes.push(message);return {persisted:true};
    }},
  };
  const post=(path,payload,headers={})=>new Request(ENDPOINT+path,{
    method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json',
      'x-ekodi-csrf':'verified-value',...headers},body:JSON.stringify(payload),
  });
  const get=path=>new Request(ENDPOINT+path);
  return {env,changes,post,get,close:()=>db.close()};
}
async function send(req,env){const response=await handlePrivateReleaseAdmin(req,env);
  return {status:response.status,data:await response.json(),headers:response.headers};}

test('endpoint is unmounted when disabled; missing private dependencies fail closed',async()=>{
  const f=fixture();try{
    assert.equal((await send(f.get(''),{...f.env,PUBLISHING_PRIVATE_RELEASE_ENABLED:'false'})).status,404);
    assert.equal((await send(f.get(''),{...f.env,PUBLISHING_RELEASE_DB:null})).status,503);
    assert.equal((await send(f.get(''),{...f.env,PUBLISHING_RELEASE_AUTH:null})).status,503);
  }finally{f.close();}
});
test('POST requires exact same-origin, server-verified CSRF and privileged authorization',async()=>{
  const f=fixture();try{
    assert.equal((await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'},
      {origin:'https://attacker.invalid'}),f.env)).status,403);
    assert.equal((await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'},
      {'x-ekodi-csrf':''}),f.env)).status,403);
    const fake={...f.env,PUBLISHING_RELEASE_AUTH:{verifyRequest:async()=>({
      authorized:true,subjectId:'staff-publisher-001',csrfVerified:false})}};
    assert.equal((await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'}),fake)).status,403);
    const blocked={...f.env,PUBLISHING_RELEASE_AUTH:{verifyRequest:async()=>({
      authorized:false,subjectId:'unauthorized',csrfVerified:true})}};
    assert.equal((await send(f.get(''),blocked)).status,403);
    assert.equal(f.changes.length,0);
  }finally{f.close();}
});
test('registration uses only verified private file, never trusts client title or public URL',async()=>{
  const f=fixture();try{
    const unsafe=await send(f.post('/register',{
      editionId:'PRIVATE-EDITION-001',checkoutEnabled:true,title:'forged-title',
    }),f.env);
    assert.equal(unsafe.status,400);
    const unknown=await send(f.post('/register',{editionId:'NONEXISTENT-001'}),f.env);
    assert.equal(unknown.status,422);
    const created=await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'}),f.env);
    assert.equal(created.status,201,JSON.stringify(created.data));
    assert.equal(created.data.record.title,candidate().title);
    assert.equal(created.data.record.state,'private_registered');
    assert.equal(created.data.record.checkoutEnabled,false);
    assert.equal(created.data.record.visibility,'private');
    assert.equal(created.headers.get('cache-control'),'private, no-store');
    assert.equal((await send(f.get(''),f.env)).data.records.length,1);
    assert.equal((await send(f.get('/PRIVATE-EDITION-001'),f.env)).data.record.revision,1);
    assert.equal((await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'}),f.env)).status,409);
    assert.deepEqual(f.changes.map(x=>x.action),['private-register']);
  }finally{f.close();}
});
test('schedule is explicit future date, signatures and rights; cancellation prevents publication',async()=>{
  const f=fixture();try{
    const created=await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'}),f.env);
    assert.equal(created.status,201);
    const date=new Date(Date.now()+10*86400000).toISOString();
    assert.equal((await send(f.post('/PRIVATE-EDITION-001/schedule',{
      revision:1,publishAt:'2026-11-07T09:00:00'}),f.env)).status,422);
    const scheduled=await send(f.post('/PRIVATE-EDITION-001/schedule',{
      revision:1,publishAt:date}),f.env);
    assert.equal(scheduled.status,200,JSON.stringify(scheduled.data));
    assert.equal(scheduled.data.record.state,'scheduled');
    assert.equal(scheduled.data.record.visibility,'private');
    assert.equal((await send(f.post('/PRIVATE-EDITION-001/schedule',{
      revision:1,publishAt:date}),f.env)).status,409);
    const cancelled=await send(f.post('/PRIVATE-EDITION-001/cancel',{
      revision:2,reason:'author-requested-withdrawal'}),f.env);
    assert.equal(cancelled.status,200);
    assert.equal(cancelled.data.record.state,'cancelled');
    assert.equal(cancelled.data.record.publishAt,null);
    assert.equal(cancelled.data.record.checkoutEnabled,false);
    assert.deepEqual(f.changes.map(x=>x.action),['private-register','schedule','cancel']);
  }finally{f.close();}
});
test('publisher signature revocation blocks even a previously registered completed book',async()=>{
  const f=fixture();try{
    const first=await send(f.post('/register',{editionId:'PRIVATE-EDITION-001'}),f.env);
    assert.equal(first.status,201);
    const env={...f.env,PUBLISHING_RELEASE_VERIFIER:{
      ...f.env.PUBLISHING_RELEASE_VERIFIER,verifyApprovalEvidence:async()=>({
        trustedBackend:true,authorSignatureValid:true,publisherSignatureValid:false,
        rightsEvidenceValid:true,assetDigestValid:true,digest:DIGEST,
      })}};
    const denied=await send(f.post('/PRIVATE-EDITION-001/schedule',{
      revision:1,publishAt:new Date(Date.now()+10*86400000).toISOString()}),env);
    assert.equal(denied.status,422);
    assert.equal((await send(f.get('/PRIVATE-EDITION-001'),f.env)).data.record.state,'private_registered');
  }finally{f.close();}
});


test('verified authenticated staff can request a same-origin CSRF token',async()=>{
  const f=fixture();try{
    const ok=await send(f.get('/csrf'),f.env);
    assert.equal(ok.status,200);
    assert.equal(ok.data.csrfToken.length,40);
    assert.equal(ok.headers.get('cache-control'),'private, no-store');
    const missing={...f.env,PUBLISHING_RELEASE_AUTH:{verifyRequest:f.env.PUBLISHING_RELEASE_AUTH.verifyRequest}};
    assert.equal((await send(f.get('/csrf'),missing)).status,503);
  }finally{f.close();}
});
