import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerCompletedEdition, scheduleApprovedEdition, claimScheduledEdition, recordPrepared,
  activationProposal, recordActivated, grantJointPublicVisibility, canExposePublicly,
  cancelUnreleasedEdition,
} from '../publishing/human/scheduled-release.js';

const DIGEST = 'sha256:' + 'a'.repeat(64);
const NOW = '2026-10-29T10:00:00+09:00';
const DUE = '2026-10-31T09:00:00+09:00';
const AFTER = '2026-10-31T09:02:00+09:00';
const STORAGE = { trustedBackend: true, privateFileVerified: true,
  editorialCompleteVerified: true, artifactDigest: DIGEST };
const EVIDENCE = { trustedBackend: true, authorSignatureValid: true,
  publisherSignatureValid: true, assetDigestValid: true, rightsEvidenceValid: true, digest: DIGEST };
const allTrue = keys => Object.fromEntries(keys.map(key => [key, true]));
const candidate = () => ({
  title: '검토된 완성 도서', authorId: 'author-test', publicationId: 'pub-test', editionId: 'pub-test-v1',
  fieldId: 'humanities', collectionId: 'jubilee-theology', format: 'epub',
  priceKrw: 9900, releaseDigest: DIGEST, readerProfiles: ['general'],
  // Synthetic fixtures only: preserve all current sale eligibility requirements.
  // In production these attestations must come from independently verified backend records.
  authorMembership: {planId:'writer1',serverVerified:true,authorId:'author-test'},
  rights: {...allTrue(['licenseChecked','authorContractApproved','distributionLicenseApproved']),
    copyrightOwnerId:'author-test'},
  salesContract: {verified:true,signedByAuthorId:'author-test',editionDigest:DIGEST,
    royaltyTermsAccepted:true,salesCommissionTermsAccepted:true},
  audiobook: {highQualityApproved:true,humanListeningQaPassed:true,
    dialogueNarrationReviewed:true,masterAssetDigest:'sha256:'+'c'.repeat(64),
    pairedEditionDigest:DIGEST,additionalBuyerPriceKrw:0,
    buyerBundleEntitlementVerified:true,refundRevocationVerified:true},
  originality: allTrue(['provenanceReviewed','verifiedNoUnauthorizedImitation']),
  craft: allTrue(['realHumanExperienceReviewed','characterAndMotivationReviewed',
    'logicAndContinuityReviewed','readerFeedbackReviewed','editorialRevisionComplete']),
  truth: allTrue(['claimsAndCitationsVerified','sensitiveClaimsReviewed']),
  graphics: allTrue(['assetRightsChecked','visualNarrativeReviewed','altTextComplete']),
  accessibility: allTrue(['epubCheckPassed','acePassed','accessibilityMetadataReady',
    'logicalReadingOrder','semanticNavigation','mobileReflowVerified','contrastVerified',
    'screenReaderVerified','keyboardNavigationVerified']),
  legal: allTrue(['identifierRequirementsVerified','bookPricePolicyVerified','digitalConsumerTermsReviewed']),
  commerce: allTrue(['signedEditionAssetReady','booksChannelConfigured',
    'mallChannelConfigured','paymentAndEntitlementValidated']),
  publisherApproval: { approvedBy: 'publisher-test', approvedAt: NOW, digest: DIGEST },
  authorApproval: { approvedBy: 'author-test', approvedAt: NOW, digest: DIGEST },
});
const registered = () => registerCompletedEdition(candidate(), STORAGE, NOW);
const scheduled = () => scheduleApprovedEdition(registered(), candidate(), DUE, EVIDENCE, NOW);
const preparing = () => claimScheduledEdition(scheduled(), candidate(), EVIDENCE, AFTER);
const ack = (record, channel, stage) => ({
  trustedBackend: true, channel, stage,
  releaseEventKey: record.releaseEventKey, releaseDigest: record.releaseDigest,
});
const prepared = () => {
  let r = preparing();
  r = recordPrepared(r,'books',ack(r,'books','prepared'));
  return recordPrepared(r,'ekodimall',ack(r,'ekodimall','prepared'));
};
const readyToRelease = () => {
  let r = prepared();
  r = recordActivated(r,'books',ack(r,'books','activated'));
  return recordActivated(r,'ekodimall',ack(r,'ekodimall','activated'));
};
const throws = (fn, snippet) => assert.throws(fn, e => e?.message?.includes('RELEASE_BLOCKED:' + snippet));

test('completed artifact registers privately, never creates a sale or public URL', () => {
  const record=registered();
  assert.equal(record.state,'private_registered');
  assert.equal(record.visibility,'private');
  assert.equal(record.checkoutEnabled,false);
  assert.equal(record.publishAt,null);
  assert.equal(record.releaseEventKey,undefined);
  assert.deepEqual(record.channels,{books:{prepared:false,activated:false},
    ekodimall:{prepared:false,activated:false}});
  assert.equal(canExposePublicly(record,'books',AFTER),false);
});

test('completed edition registration requires actual verified private file and digest', () => {
  throws(() => registerCompletedEdition(candidate(), {}, NOW),'private-asset-verification-required');
  throws(() => registerCompletedEdition(candidate(), { ...STORAGE, artifactDigest:'sha256:'+ 'b'.repeat(64) }, NOW),
    'private-asset-verification-required');
  throws(() => registerCompletedEdition({ ...candidate(), releaseDigest:'arbitrary' }, STORAGE, NOW),
    'complete-edition-metadata-required');
});

test('a private book cannot schedule sale without an explicit timezone, a future date and final approval', () => {
  throws(() => scheduleApprovedEdition(registered(),candidate(),'2026-10-31T09:00:00',EVIDENCE,NOW),
    'explicit-timezone-required');
  throws(() => scheduleApprovedEdition(registered(),candidate(),NOW,EVIDENCE,NOW),
    'publish-time-not-future');
  throws(() => scheduleApprovedEdition(registered(),candidate(),'2026-02-30T09:00:00+09:00',EVIDENCE,NOW),
    'invalid-time');
  throws(() => scheduleApprovedEdition(registered(),candidate(),DUE,null,NOW),
    'trusted-approval-proof-required');
  const missingRights = candidate();
  missingRights.rights.licenseChecked=false;
  throws(() => scheduleApprovedEdition(registered(),missingRights,DUE,EVIDENCE,NOW),
    'editorial-gate');
  const changed = candidate();
  changed.releaseDigest='sha256:'+'b'.repeat(64);
  throws(() => scheduleApprovedEdition(registered(),changed,DUE,EVIDENCE,NOW),
    'edition-mismatch:releaseDigest');
  const unapproved = candidate(); unapproved.authorApproval.digest = 'sha256:wrong';
  throws(() => scheduleApprovedEdition(registered(),unapproved,DUE,EVIDENCE,NOW),
    'author-approval-required');
});

test('approved schedule stays private before release time and can be rescheduled', () => {
  const r=scheduled();
  assert.equal(r.state,'scheduled');
  assert.equal(r.checkoutEnabled,false);
  assert.equal(r.publishAt,'2026-10-31T00:00:00.000Z');
  assert.match(r.releaseEventKey,/^human-release:/);
  assert.equal(canExposePublicly(r,'books',AFTER),false);
  const second=scheduleApprovedEdition(r,candidate(),'2026-11-01T09:00:00+09:00',EVIDENCE,NOW);
  assert.equal(second.revision,r.revision+1);
  assert.equal(second.publishAt,'2026-11-01T00:00:00.000Z');
  assert.equal(canExposePublicly(second,'ekodimall',AFTER),false);
});

test('cron cannot claim a future schedule, changed asset, revoked approval or missing proof', () => {
  throws(() => claimScheduledEdition(scheduled(),candidate(),EVIDENCE,NOW),'not-due');
  const changed=candidate();changed.releaseDigest='sha256:'+'b'.repeat(64);
  throws(() => claimScheduledEdition(scheduled(),changed,EVIDENCE,AFTER),'edition-mismatch');
  throws(() => claimScheduledEdition(scheduled(),candidate(),null,AFTER),
    'trusted-approval-proof-invalidated');
  const noRights=candidate();noRights.rights.licenseChecked=false;
  throws(() => claimScheduledEdition(scheduled(),noRights,EVIDENCE,AFTER),'editorial-gate');
});

test('one channel prepared never makes the book public or activates it', () => {
  const r=preparing();
  const one=recordPrepared(r,'books',ack(r,'books','prepared'));
  assert.equal(one.state,'preparing');
  assert.equal(canExposePublicly(one,'books',AFTER),false);
  throws(() => activationProposal(one,AFTER),'not-dual-prepared');
  throws(() => recordPrepared(one,'ekodimall',ack(one,'books','prepared')),'untrusted-channel-ack');
});

test('prepare and activation use idempotent version-bound channel acknowledgements', () => {
  const p=prepared();
  assert.equal(p.state,'prepared');
  assert.equal(p.visibility,'private');
  const intent=activationProposal(p,AFTER);
  assert.equal(intent.channels.length,2);
  assert.equal(intent.deliveryState,'not_dispatched');
  assert.match(intent.idempotencyKey,/^activate:human-release:/);
  let activating=recordActivated(p,'books',ack(p,'books','activated'));
  assert.equal(activating.state,'activating');
  assert.equal(canExposePublicly(activating,'books',AFTER),false);
  throws(() => recordActivated(activating,'ekodimall',{
    ...ack(activating,'ekodimall','activated'), releaseDigest:'sha256:wrong'
  }),'untrusted-activation-ack');
  activating=recordActivated(activating,'ekodimall',ack(activating,'ekodimall','activated'));
  assert.equal(activating.state,'ready_to_release');
  assert.equal(canExposePublicly(activating,'books',AFTER),false);
});

test('central exposure happens only after TWO channel activation confirmations', () => {
  const r=readyToRelease();
  assert.equal(r.visibility,'private');
  throws(() => grantJointPublicVisibility(prepared(),AFTER),'not-jointly-activated');
  const live=grantJointPublicVisibility(r,AFTER);
  assert.equal(live.state,'released');
  assert.equal(canExposePublicly(live,'books',AFTER),true);
  assert.equal(canExposePublicly(live,'ekodimall',AFTER),true);
  assert.equal(canExposePublicly(live,'unknown',AFTER),false);
  assert.equal(canExposePublicly(live,'books',NOW),false);
});

test('cancelling a future slot requires a reason and never exposes the book', () => {
  const r=scheduled();
  throws(() => cancelUnreleasedEdition(r,''),'cancellation-reason-required');
  const cancelled=cancelUnreleasedEdition(r,'author-revoked-rights');
  assert.equal(cancelled.state,'cancelled');
  assert.equal(cancelled.publishAt,null);
  assert.equal(canExposePublicly(cancelled,'books',AFTER),false);
  throws(() => claimScheduledEdition(cancelled,candidate(),EVIDENCE,AFTER),'not-scheduled');
  const live=grantJointPublicVisibility(readyToRelease(),AFTER);
  throws(() => cancelUnreleasedEdition(live,'change'),'released-edition-needs-takedown-workflow');
});

test('lack of verified client-side proof cannot bypass the engine',()=>{
  const r=scheduled();
  const p=preparing();
  throws(() => recordPrepared(p,'books',{channel:'books',stage:'prepared',
    releaseEventKey:p.releaseEventKey,releaseDigest:p.releaseDigest}),'untrusted-channel-ack');
  assert.equal(r.state,'scheduled');
});
