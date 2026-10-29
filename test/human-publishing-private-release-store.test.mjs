import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerCompletedEdition, scheduleApprovedEdition, canExposePublicly } from '../publishing/human/scheduled-release.js';
import { storePrivateEdition, savePrivateTransition, readPrivateEdition, listDuePrivateEditions } from '../publishing/human/private-release-store.js';
import { runPrivateScheduleTick, getPublicVisibility } from '../publishing/human/scheduled-release-runner.js';

const DIGEST='sha256:'+'c'.repeat(64);
const NOW='2026-10-29T01:00:00.000Z';
const DATE='2026-10-31T00:00:00.000Z';
const AFTER='2026-10-31T00:05:00.000Z';
const fields=xs=>Object.fromEntries(xs.map(x=>[x,true]));
const candidate=()=>({
  publicationId:'book-01',editionId:'edition-01',title:'출판 준비 완료된 도서',
  authorId:'author-a',format:'epub',fieldId:'humanities',collectionId:'human',
  priceKrw:9900,releaseDigest:DIGEST,readerProfiles:['general'],
  rights:fields(['licenseChecked','authorContractApproved']),
  originality:fields(['provenanceReviewed','verifiedNoUnauthorizedImitation']),
  craft:fields(['realHumanExperienceReviewed','characterAndMotivationReviewed',
    'logicAndContinuityReviewed','readerFeedbackReviewed','editorialRevisionComplete']),
  truth:fields(['claimsAndCitationsVerified','sensitiveClaimsReviewed']),
  graphics:fields(['assetRightsChecked','visualNarrativeReviewed','altTextComplete']),
  accessibility:fields(['epubCheckPassed','acePassed','accessibilityMetadataReady',
    'logicalReadingOrder','semanticNavigation','mobileReflowVerified',
    'contrastVerified','screenReaderVerified','keyboardNavigationVerified']),
  legal:fields(['identifierRequirementsVerified','bookPricePolicyVerified','digitalConsumerTermsReviewed']),
  commerce:fields(['signedEditionAssetReady','booksChannelConfigured',
    'mallChannelConfigured','paymentAndEntitlementValidated']),
  publisherApproval:{approvedBy:'publisher-a',approvedAt:NOW,digest:DIGEST},
  authorApproval:{approvedBy:'author-a',approvedAt:NOW,digest:DIGEST},
});
const evidence=()=>({
  trustedBackend:true,authorSignatureValid:true,publisherSignatureValid:true,
  assetDigestValid:true,rightsEvidenceValid:true,digest:DIGEST,
});
function setup() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../publishing/human/sql/001_private_scheduled_editions.sql',import.meta.url),'utf8'));
  return {
    close:()=>sqlite.close(),
    prepare(sql){const st=sqlite.prepare(sql);return {
      bind(...values){return {
        async run(){const result=st.run(...values);return {meta:{changes:Number(result.changes)}};},
        async first(){return st.get(...values)||null;},
        async all(){return {results:st.all(...values)};},
      }},
    }},
  };
}
async function readyScheduled(db) {
  const c=candidate(),r=registerCompletedEdition(c,{trustedBackend:true,privateFileVerified:true,
    editorialCompleteVerified:true,artifactDigest:DIGEST},NOW);
  await storePrivateEdition(db,r,NOW);
  const s=scheduleApprovedEdition(r,c,DATE,evidence(),NOW);
  await savePrivateTransition(db,r,s,NOW);
  return s;
}
const ack=(channel,rec,stage)=>({trustedBackend:true,channel,stage,
  releaseEventKey:rec.releaseEventKey,releaseDigest:rec.releaseDigest});

test('SQL constraint forbids exposure of private or unapproved edition',async()=>{
  const db=setup();try{
    const r=await readyScheduled(db);
    assert.equal((await listDuePrivateEditions(db,NOW)).length,0);
    assert.equal((await listDuePrivateEditions(db,AFTER)).length,1);
    assert.equal(await getPublicVisibility(db,r.editionId,'books',AFTER),false);
    assert.equal(await getPublicVisibility(db,r.editionId,'ekodimall',AFTER),false);
    await assert.rejects(storePrivateEdition(db,{...r,state:'private_registered',revision:1,
      checkoutEnabled:true,visibility:'public'},NOW),/PRIVATE_RELEASE_STORE:visibility-fail-closed/);
    const duplicate=await readPrivateEdition(db,r.editionId);
    assert.equal(duplicate.state,'scheduled');
  }finally{db.close();}
});

test('successful due tick releases both channels only after verified prepare+activate',async()=>{
  const db=setup();try{
    const r=await readyScheduled(db);
    let before=await runPrivateScheduleTick({db,nowIso:NOW,loadCandidate:async()=>candidate(),
      verifyEvidence:async()=>evidence(),prepareChannel:async()=>{throw Error('not due');},
      activateChannel:async()=>{throw Error('not due');}});
    assert.equal(before.processed,0);
    const calls=[];
    const result=await runPrivateScheduleTick({db,nowIso:AFTER,
      loadCandidate:async()=>candidate(),verifyEvidence:async()=>evidence(),
      prepareChannel:async(channel,record)=>{calls.push('prepare:'+channel);return ack(channel,record,'prepared');},
      activateChannel:async(channel,record,_candidate,event)=>{
        calls.push('activate:'+channel);assert.equal(event.deliveryState,'not_dispatched');
        return ack(channel,record,'activated');
      }});
    assert.equal(result.results[0].ok,true,JSON.stringify(result));
    assert.deepEqual(calls,['prepare:books','prepare:ekodimall',
      'activate:books','activate:ekodimall']);
    assert.equal(await getPublicVisibility(db,r.editionId,'books',AFTER),true);
    assert.equal(await getPublicVisibility(db,r.editionId,'ekodimall',AFTER),true);
    assert.equal((await listDuePrivateEditions(db,AFTER)).length,0);
  }finally{db.close();}
});

test('failure of one storefront blocks BOTH; next tick resumes idempotently',async()=>{
  const db=setup();try{
    const r=await readyScheduled(db);
    let failMall=true;const calls=[];
    const args={
      db,nowIso:AFTER,loadCandidate:async()=>candidate(),verifyEvidence:async()=>evidence(),
      prepareChannel:async(channel,record)=>{
        calls.push('prepare:'+channel);
        if(channel==='ekodimall'&&failMall){failMall=false;throw Error('temporary offline');}
        return ack(channel,record,'prepared');},
      activateChannel:async(channel,record)=>{calls.push('activate:'+channel);return ack(channel,record,'activated');},
    };
    const first=await runPrivateScheduleTick(args);
    assert.equal(first.results[0].ok,false);
    assert.equal((await readPrivateEdition(db,r.editionId)).state,'preparing');
    assert.equal(await getPublicVisibility(db,r.editionId,'books',AFTER),false);
    assert.equal(await getPublicVisibility(db,r.editionId,'ekodimall',AFTER),false);
    const second=await runPrivateScheduleTick(args);
    assert.equal(second.results[0].ok,true,JSON.stringify(second));
    assert.deepEqual(calls,['prepare:books','prepare:ekodimall','prepare:ekodimall',
      'activate:books','activate:ekodimall']);
    assert.equal(await getPublicVisibility(db,r.editionId,'books',AFTER),true);
    assert.equal(await getPublicVisibility(db,r.editionId,'ekodimall',AFTER),true);
  }finally{db.close();}
});

test('CAS prevents two writers from overwriting cancellation or changed state',async()=>{
  const db=setup();try{
    const r=await readyScheduled(db);
    const next={...r,state:'blocked',revision:r.revision+1,visibility:'private',
      checkoutEnabled:false,publishAt:null};
    await savePrivateTransition(db,r,next,AFTER);
    await assert.rejects(savePrivateTransition(db,r,{...r,state:'preparing',
      revision:r.revision+1},AFTER),/stale-revision/);
    assert.equal((await readPrivateEdition(db,r.editionId)).state,'blocked');
    assert.equal((await listDuePrivateEditions(db,AFTER)).length,0);
  }finally{db.close();}
});

test('public gate fails closed if edition DB inaccessible or record missing',async()=>{
  assert.equal(await getPublicVisibility(null,'missing','books',AFTER),false);
  const db=setup();try{
    assert.equal(await getPublicVisibility(db,'missing','books',AFTER),false);
  }finally{db.close();}
});
