import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReleaseReadiness } from '../publishing/human/editorial-policy.js';
import { publicationTransition, permittedAiRequest, validScheduledAt, scheduleReadiness } from '../publishing/workflow-policy.js';

const digest='a'.repeat(64),later='b'.repeat(64);
const now=new Date('2026-10-29T01:30:00.000Z');
const author={userId:'writer',role:'author'}, editor={userId:'editor',role:'editor'};
const publisher={userId:'publisher',role:'publisher'}, admin={userId:'administrator',role:'admin'};
function quality(){
  const base={format:'epub',priceKrw:9900,readerProfiles:['general'],collectionId:'human'};
  const blockers=evaluateReleaseReadiness({publicationId:'p',editionId:'p:v1',title:'새 도서',
    authorId:'writer',fieldId:'literature',releaseDigest:digest,...base,
    publisherApproval:{approvedBy:'publisher',approvedAt:now.toISOString(),digest}}).blockers;
  for(const key of blockers) {
    const parts=key.split('.');
    if(parts.length!==2)throw Error('Unknown QA blocker '+key);
    base[parts[0]]??={};
    base[parts[0]][parts[1]]=true;
  }
  return base;
}
const initial=()=>({
  id:'project',publicationId:'project',editionId:'project:v1',title:'새 도서',
  authorUserId:'writer',fieldId:'literature',collectionId:'human',stage:'planning',
  manuscriptDigest:null,releaseDigest:null,releaseCandidate:{},authorApproval:null,
  publisherApproval:null,scheduledAt:null,revision:1
});
function advance(p,action,input,actor=author,at=now){
  const verified=['submit','publisher_approve','schedule','prepare_handoff'].includes(action) ? {ready:true} : {};
  const v=publicationTransition(p,action,input,actor,at,verified);
  assert.equal(v.ok,true,action+': '+JSON.stringify(v));
  return v.next;
}
test('author/editor/publisher independently approve and reserve, but cannot automatically sell',()=>{
  let p=initial();
  p=advance(p,'revise',{manuscriptDigest:digest},author);
  assert.equal(p.stage,'drafting');
  p=advance(p,'submit',{},author);
  p.releaseDigest=later;p.releaseCandidate=quality();
  p=advance(p,'editor_pass',{checklist:{completed:true}},editor);
  p=advance(p,'author_approve',{digest:later,rightsConsent:true},author);
  p=advance(p,'publisher_approve',{digest:later},publisher);
  const scheduledAt='2026-11-25T01:30:00.000Z';
  p=advance(p,'schedule',{digest:later,scheduledAt,channels:['books','ekodimall']},publisher);
  assert.equal(p.stage,'scheduled');
  assert.equal(scheduleReadiness(p,now),false);
  assert.equal(publicationTransition(p,'prepare_handoff',{},publisher,now).code,'NOT_DUE');
  p=advance(p,'prepare_handoff',{},publisher,new Date(scheduledAt));
  assert.equal(p.stage,'handoff_ready');
  assert.equal(p.handoffProposal.deliveryState,'not_dispatched');
  assert.equal(p.releasedAt,undefined);
});
test('admin cannot forge the author consent, editor cannot authorize sale',()=>{
  let p={...initial(),stage:'ready_for_author',releaseDigest:digest};
  assert.equal(publicationTransition(p,'author_approve',{digest,rightsConsent:true},admin,now).code,'FORBIDDEN');
  assert.equal(publicationTransition(p,'author_approve',{digest,rightsConsent:true},editor,now).code,'FORBIDDEN');
  assert.equal(publicationTransition({...p,stage:'author_approved'},'publisher_approve',{digest},editor,now).code,'FORBIDDEN');
});
test('stale content, empty rights and missing QA block author and publisher approval',()=>{
  const p={...initial(),stage:'ready_for_author',releaseDigest:digest};
  assert.equal(publicationTransition(p,'author_approve',{digest:later,rightsConsent:true},author,now).code,'EDITION_MISMATCH');
  assert.equal(publicationTransition(p,'author_approve',{digest,rightsConsent:false},author,now).code,'AUTHOR_RIGHTS_CONSENT_REQUIRED');
  const q={...p,stage:'author_approved',authorApproval:{digest,actor:'writer'},releaseCandidate:{}};
  assert.equal(publicationTransition(q,'publisher_approve',{digest},publisher,now).code,'RELEASE_QA_BLOCKED');
  assert.equal(publicationTransition({...q,stage:'publisher_approved'},'schedule',{digest,scheduledAt:'2026-12-01T01:00:00Z',channels:['books']},publisher,now).code,'DUAL_CHANNEL_REQUIRED');
});
test('editing after frozen edition and early schedule manipulation are blocked',()=>{
  const p={...initial(),stage:'scheduled',manuscriptDigest:digest};
  assert.equal(publicationTransition(p,'revise',{manuscriptDigest:later},author,now).code,'FROZEN_EDITION');
  assert.equal(publicationTransition(p,'prepare_handoff',{},author,now).code,'FORBIDDEN');
  assert.equal(validScheduledAt('2026-11-01T10:00:00Z',now),true);
  assert.equal(validScheduledAt('2026-09-01T10:00:00Z',now),false);
  assert.equal(validScheduledAt('2026-11-01T10:00:00+09:00',now),false);
});
test('paid/provider API calls and no-consent jobs are rejected',()=>{
  assert.equal(permittedAiRequest('draft',{ownerConsent:false}).code,'AUTHOR_CONSENT_REQUIRED');
  assert.equal(permittedAiRequest('draft',{provider:'paid',ownerConsent:true}).code,'PAID_PROVIDER_APPROVAL_REQUIRED');
  assert.equal(permittedAiRequest('draft',{spendKrw:1,ownerConsent:true}).code,'PAID_PROVIDER_APPROVAL_REQUIRED');
  assert.equal(permittedAiRequest('draft',{ownerConsent:true}).state,'queued');
});

test('free/unsigned author sale is blocked even when a publisher approves the editorial draft',()=>{
  let p={...initial(),stage:'author_approved',releaseDigest:digest,
    authorApproval:{actor:'writer',digest,approvedAt:now.toISOString()},releaseCandidate:quality()};
  assert.equal(publicationTransition({...p,stage:'drafting',manuscriptDigest:digest},'submit',{},author,now).code,'PAID_PUBLISHING_SUBMISSION_REQUIRED');
  assert.equal(publicationTransition(p,'publisher_approve',{digest},publisher,now).code,'COMMERCIAL_VERIFICATION_REQUIRED');
  assert.equal(publicationTransition(p,'publisher_approve',{digest},publisher,now,
    {ready:false,reason:'PAID_OR_CHIEF_REQUIRED'}).code,'COMMERCIAL_VERIFICATION_REQUIRED');
  p.stage='publisher_approved';p.publisherApproval={approvedBy:'publisher',digest,approvedAt:now.toISOString()};
  assert.equal(publicationTransition(p,'schedule',{digest,scheduledAt:'2026-11-25T01:30:00.000Z',
    channels:['books','ekodimall']},publisher,now).code,'COMMERCIAL_VERIFICATION_REQUIRED');
});
