import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReleaseReadiness } from '../publishing/human/editorial-policy.js';
import {
  createVerifiedPublishingWorkflowBridge, privateEditionId, workflowEditionId,
} from '../publishing/human/verified-workflow-bridge.js';

const projectId='00000000-0000-4000-8000-000000000042';
const sourceEditionId=projectId+':v1';
const privateId=projectId+'-v1';
const hex='a'.repeat(64),pref='sha256:'+hex;
const author='author-test-001',publisher='publisher-test-001';
const clone=value=>JSON.parse(JSON.stringify(value));
const time='2026-10-30T00:00:00.000Z';

function quality(){
  const value={
    format:'epub',readerProfiles:['general'],priceKrw:9900,
    authorMembership:{planId:'writer1',serverVerified:true,authorId:author},
    rights:{copyrightOwnerId:author,distributionLicenseApproved:true},
    salesContract:{verified:true,signedByAuthorId:author,editionDigest:hex,
      royaltyTermsAccepted:true,salesCommissionTermsAccepted:true},
    audiobook:{highQualityApproved:true,humanListeningQaPassed:true,
      dialogueNarrationReviewed:true,masterAssetDigest:'sha256:'+'e'.repeat(64),
      pairedEditionDigest:hex,additionalBuyerPriceKrw:0,
      buyerBundleEntitlementVerified:true,refundRevocationVerified:true},
  };
  const dummy={...value,publicationId:projectId,editionId:privateId,
    title:'승인된 책',fieldId:'humanities',collectionId:'human',
    authorId:author,releaseDigest:pref,
    publisherApproval:{approvedBy:publisher,approvedAt:time,digest:pref},
    audiobook:{...value.audiobook,pairedEditionDigest:pref},
    salesContract:{...value.salesContract,editionDigest:pref},
  };
  for(const missing of evaluateReleaseReadiness(dummy).blockers){
    const parts=missing.split('.');
    assert.equal(parts.length,2,'Unexpected readiness contract: '+missing);
    value[parts[0]]??={};
    value[parts[0]][parts[1]]=true;
  }
  return value;
}
function snapshot(){
  return {project:{
    id:projectId,editionId:sourceEditionId,authorUserId:author,
    title:'승인된 책',fieldId:'humanities',collectionId:'human',
    stage:'publisher_approved',revision:7,releaseDigest:hex,
    authorApproval:{actor:author,approvedBy:author,digest:hex,approvedAt:time},
    publisherApproval:{approvedBy:publisher,digest:hex,approvedAt:time},
    releaseCandidate:quality(),
  }};
}
const signed=fields=>({
  trustedBackend:true,projectId,sourceEditionId,releaseDigest:hex,revision:7,
  authorSignatureValid:true,publisherSignatureValid:true,
  assetDigestValid:true,rightsEvidenceValid:true,
  paidAuthorVerified:true,commercialContractVerified:true,audiobookVerified:true,
  ...fields,
});
function fixtures({snap=snapshot(),sign={},asset={},ack={},mutate}={}){
  let read=0,checked=0,fileChecks=0,receiptChecks=0;
  const binding=createVerifiedPublishingWorkflowBridge({
    workflow:{
      async getApprovedEdition({sourceEditionId:id}){
        read++;assert.equal(id,sourceEditionId);
        return clone(mutate?mutate(read,clone(snap)):snap);
      },
      async verifyApprovedEdition(req){
        checked++;
        return signed({candidateSha256:req.candidateSha256,...sign});
      },
    },
    privateAssets:{
      async verifyImmutableEdition(req){
        fileChecks++;
        return {trustedBackend:true,privateFileVerified:true,
          editionId:req.editionId,artifactDigest:req.releaseDigest,...asset};
      },
    },
    channelReceipts:{
      async verifySignedAck(req){
        receiptChecks++;
        return {trustedBackend:true,valid:true,
          channel:req.channel,editionId:req.editionId,
          releaseDigest:req.releaseDigest,releaseEventKey:req.releaseEventKey,
          stage:req.stage,...ack};
      },
    },
  });
  return {binding,stats:()=>({read,checked,fileChecks,receiptChecks})};
}
test('workflow UUID:v1 IDs map reversibly to safe private scheduler IDs',()=>{
  assert.equal(privateEditionId(sourceEditionId),privateId);
  assert.equal(workflowEditionId(privateId),sourceEditionId);
  assert.throws(()=>privateEditionId('client-controlled:v1'),/SOURCE_EDITION_ID_INVALID/);
  assert.throws(()=>workflowEditionId('../escape'),/PRIVATE_EDITION_ID_INVALID/);
  assert.throws(()=>workflowEditionId(privateId+'?on-sale=1'),/PRIVATE_EDITION_ID_INVALID/);
});
test('trusted current proof yields private-only cross-workflow candidate and matching file/approval evidence',async()=>{
  const {binding,stats}=fixtures();
  const candidate=await binding.loadCandidate(privateId);
  assert.equal(candidate.editionId,privateId);
  assert.equal(candidate.releaseDigest,pref);
  assert.equal(candidate.authorApproval.approvedBy,author);
  assert.equal(candidate.authorApproval.digest,pref);
  assert.equal(candidate.publisherApproval.digest,pref);
  assert.equal(candidate.salesContract.editionDigest,pref);
  assert.equal(candidate.audiobook.pairedEditionDigest,pref);
  assert.equal(evaluateReleaseReadiness(candidate).ready,true);
  assert.equal(candidate.saleReady,undefined);
  assert.equal(candidate.checkoutEnabled,undefined);
  assert.equal(candidate.visibility,undefined);
  const registration=await binding.verifyCompletedFile(candidate);
  assert.equal(registration.privateFileVerified,true);
  assert.equal(registration.artifactDigest,pref);
  const record={editionId:privateId,publicationId:projectId,authorId:author,
    title:candidate.title,releaseDigest:pref};
  const proof=await binding.verifyApprovalEvidence(record,candidate);
  assert.equal(proof.authorSignatureValid,true);
  assert.equal(proof.digest,pref);
  assert.ok(stats().checked>=3,'fresh verification is required per action');
});
test('forged or stale signature / wrong source edition / unapproved stage all block',async()=>{
  for(const sign of [
    {authorSignatureValid:false},{publisherSignatureValid:false},
    {rightsEvidenceValid:false},{assetDigestValid:false},
    {releaseDigest:'b'.repeat(64)},{candidateSha256:'f'.repeat(64)},
    {revision:6},{commercialContractVerified:false},
    {paidAuthorVerified:false},{audiobookVerified:false}
  ]){
    assert.equal(await fixtures({sign}).binding.loadCandidate(privateId),null,
      'must reject '+JSON.stringify(sign));
  }
  for(const change of [
    p=>{p.project.stage='drafting';},
    p=>{p.project.authorApproval.actor='wrong';},
    p=>{p.project.authorApproval.approvedBy='chief-admin';},
    p=>{p.project.publisherApproval.digest='b'.repeat(64);},
    p=>{p.project.editionId='other:v1';},
    p=>{p.project.id='00000000-0000-4000-8000-000000000043';},
    p=>{p.project.releaseDigest='sha256:'+hex;},
  ]){
    const snap=snapshot();change(snap);
    assert.equal(await fixtures({snap}).binding.loadCandidate(privateId),null);
  }
});
test('missing or incorrect audiobook rights cannot be upgraded by a valid signature',async()=>{
  for(const change of [
    p=>delete p.project.releaseCandidate.audiobook,
    p=>{p.project.releaseCandidate.audiobook.pairedEditionDigest='b'.repeat(64);},
    p=>{p.project.releaseCandidate.audiobook.humanListeningQaPassed=false;},
    p=>{p.project.releaseCandidate.authorMembership.serverVerified=false;},
    p=>{p.project.releaseCandidate.salesContract.verified=false;},
  ]){
    const snap=snapshot();change(snap);
    assert.equal(await fixtures({snap}).binding.loadCandidate(privateId),null);
  }
});
test('unavailable assets or tampered private candidate fail closed on storage and schedule',async()=>{
  const unavailable=fixtures({asset:{privateFileVerified:false}});
  const candidate=await unavailable.binding.loadCandidate(privateId);
  assert.equal(await unavailable.binding.verifyCompletedFile(candidate),null);
  const record={editionId:privateId,publicationId:projectId,title:candidate.title,
    authorId:author,releaseDigest:pref};
  assert.equal(await unavailable.binding.verifyApprovalEvidence(record,candidate),null);
  const {binding}=fixtures();
  const another=await binding.loadCandidate(privateId);
  another.audiobook.highQualityApproved=false;
  assert.equal(await binding.verifyApprovalEvidence(record,another),null);
  assert.equal(await binding.verifyCompletedFile(another),null);
  assert.equal(await binding.verifyApprovalEvidence({...record,title:'forged-title'},
    await binding.loadCandidate(privateId)),null);
});
test('author rights revoked between registration and scheduling block any new attestation',async()=>{
  const {binding}=fixtures({mutate:(n,p)=>{
    if(n>1)p.project.releaseCandidate.rights.distributionLicenseApproved=false;
    return p;
  }});
  const candidate=await binding.loadCandidate(privateId);
  assert.ok(candidate);
  const record={editionId:privateId,publicationId:projectId,title:candidate.title,
    authorId:author,releaseDigest:pref};
  assert.equal(await binding.verifyApprovalEvidence(record,candidate),null);
});
test('external channel ACK is not trusted without exact signed backend echo',async()=>{
  const input={channel:'books',editionId:privateId,releaseDigest:pref,
    releaseEventKey:'human-release:'+privateId+':'+pref,stage:'prepared'};
  const good=fixtures();
  assert.equal((await good.binding.verifyChannelAck(input)).valid,true);
  assert.equal((await good.binding.verifyChannelAck({...input,channel:'unknown'})).valid,false);
  for(const ack of [{trustedBackend:false},{valid:false},{channel:'ekodimall'},
    {releaseDigest:'sha256:'+'b'.repeat(64)},{stage:'activated'}]){
    assert.equal((await fixtures({ack}).binding.verifyChannelAck(input)).valid,false);
  }
  assert.equal((await createVerifiedPublishingWorkflowBridge({}).verifyChannelAck(input)).valid,false);
});
test('without all protected private bindings the adapter never grants access',async()=>{
  const binding=createVerifiedPublishingWorkflowBridge();
  assert.equal(await binding.loadCandidate(privateId),null);
  assert.equal(await binding.verifyCompletedFile({editionId:privateId}),null);
  assert.equal(await binding.verifyApprovalEvidence({},{}),null);
  assert.equal((await binding.verifyChannelAck({channel:'books'})).valid,false);
});
