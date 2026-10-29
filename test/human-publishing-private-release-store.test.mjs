import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrivateReleaseTestDb } from './private-release-sqlite-test-support.mjs';
import { registerCompletedEdition, scheduleApprovedEdition, canExposePublicly } from '../publishing/human/scheduled-release.js';
import { readPrivateEdition, listDuePrivateEditions } from '../publishing/human/private-release-store.js';
import { commitPrivateRegistration, commitPrivateTransition } from '../publishing/human/private-release-atomic-ledger.js';
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
const setup=makePrivateReleaseTestDb;

async function readyScheduled(db) {
  const c=candidate(),r=registerCompletedEdition(c,{trustedBackend:true,privateFileVerified:true,
    editorialCompleteVerified:true,artifactDigest:DIGEST},NOW);
  await commitPrivateRegistration(db,r,'publisher-test',NOW);
  const s=scheduleApprovedEdition(r,c,DATE,evidence(),NOW);
  await commitPrivateTransition(db,r,s,'publisher-test',NOW);
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
    await assert.rejects(commitPrivateRegistration(db,{...r,state:'private_registered',revision:1,
      checkoutEnabled:true,visibility:'public'},'publisher-test',NOW),/PUBLISHING_ATOMIC:private-registration-only/);
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
    await commitPrivateTransition(db,r,next,'publisher-test',AFTER);
    await assert.rejects(commitPrivateTransition(db,r,{...r,state:'preparing',
      revision:r.revision+1},'publisher-test',AFTER),/batch-missing-mutation|stale-or-audit-outbox/);
    assert.equal((await readPrivateEdition(db,r.editionId)).state,'blocked');
    assert.equal((await listDuePrivateEditions(db,AFTER)).length,0);
  }finally{db.close();}
});


test('rights revoked after both staged prevents publication and remains private',async()=>{
  const db=setup();try{
    const r=await readyScheduled(db);
    let altered=false;
    const fail=await runPrivateScheduleTick({db,nowIso:AFTER,
      loadCandidate:async()=>{const c=candidate();if(altered)c.rights.licenseChecked=false;return c;},
      verifyEvidence:async()=>evidence(),
      prepareChannel:async(channel,record)=>ack(channel,record,'prepared'),
      activateChannel:async(channel,record)=>{
        altered=true;
        if(channel==='ekodimall')throw Error('temporary activation outage');
        return ack(channel,record,'activated');
      }});
    assert.equal(fail.results[0].ok,false);
    const partial=await readPrivateEdition(db,r.editionId);
    assert.equal(partial.state,'activating');
    assert.equal(await getPublicVisibility(db,r.editionId,'books',AFTER),false);
    const retry=await runPrivateScheduleTick({db,nowIso:AFTER,
      loadCandidate:async()=>{const c=candidate();c.rights.licenseChecked=false;return c;},
      verifyEvidence:async()=>evidence(),
      prepareChannel:async()=>{throw Error('must-not-call-prepare');},
      activateChannel:async()=>{throw Error('must-not-call-activate');}});
    assert.equal(retry.results[0].ok,false);
    assert.match(retry.results[0].error,/editorial-gate/);
    assert.equal(await getPublicVisibility(db,r.editionId,'ekodimall',AFTER),false);
  }finally{db.close();}
});

test('public gate fails closed if edition DB inaccessible or record missing',async()=>{
  assert.equal(await getPublicVisibility(null,'missing','books',AFTER),false);
  const db=setup();try{
    assert.equal(await getPublicVisibility(db,'missing','books',AFTER),false);
  }finally{db.close();}
});
