import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_CATALOG, monthlyEditorialSlots, evaluateReleaseReadiness, approvedDualChannelHandoff } from '../publishing/human/editorial-policy.js';

function release(overrides = {}) {
  const book = {
    publicationId: 'HP-001', editionId: 'HP-001-EPUB-1', title: '완성된 독립 작품',
    authorId: 'AUTHOR-1', fieldId: 'literature', format: 'epub', priceKrw: 9900,
    releaseDigest: 'sha256:approved-content', readerProfiles: ['general'], collectionId: 'human',
    rights: { licenseChecked: true, authorContractApproved: true,
      copyrightOwnerId: 'AUTHOR-1', distributionLicenseApproved: true },
    authorMembership: { planId: 'writer1', serverVerified: true, authorId: 'AUTHOR-1' },
    salesContract: { verified: true, signedByAuthorId: 'AUTHOR-1',
      editionDigest: 'sha256:approved-content', royaltyTermsAccepted: true,
      salesCommissionTermsAccepted: true },
    audiobook: { highQualityApproved: true, humanListeningQaPassed: true,
      dialogueNarrationReviewed: true, masterAssetDigest: 'sha256:premium-audio',
      pairedEditionDigest: 'sha256:approved-content', additionalBuyerPriceKrw: 0,
      buyerBundleEntitlementVerified: true, refundRevocationVerified: true },
    originality: { provenanceReviewed: true, verifiedNoUnauthorizedImitation: true },
    craft: { realHumanExperienceReviewed: true, characterAndMotivationReviewed: true,
      logicAndContinuityReviewed: true, readerFeedbackReviewed: true, editorialRevisionComplete: true },
    truth: { claimsAndCitationsVerified: true, sensitiveClaimsReviewed: true },
    graphics: { assetRightsChecked: true, visualNarrativeReviewed: true,
      altTextComplete: true, childStoryboardReviewed: true },
    accessibility: { epubCheckPassed: true, acePassed: true, accessibilityMetadataReady: true,
      logicalReadingOrder: true, semanticNavigation: true, mobileReflowVerified: true,
      contrastVerified: true, screenReaderVerified: true, keyboardNavigationVerified: true,
      userFontOverride: true, adjustableLineSpacing: true, nonJustifiedReadingMode: true,
      textToSpeechCompatible: true, graphicTextEquivalents: true },
    audience: { childAgeBandDefined: true, childSafetyReviewed: true, childReaderTested: true,
      teenDevelopmentReviewed: true, teenReaderTested: true, sensitiveSubjectAgeReviewed: true,
      dyslexicReaderTested: true },
    legal: { identifierRequirementsVerified: true, bookPricePolicyVerified: true,
      digitalConsumerTermsReviewed: true },
    commerce: { signedEditionAssetReady: true, booksChannelConfigured: true,
      mallChannelConfigured: true, paymentAndEntitlementValidated: true },
    print: { printReadyPDF: true, proofApproved: true, supplierContractVerified: true,
      fulfillmentAndReturnsVerified: true },
    publisherApproval: { approvedBy: 'publisher-1', approvedAt: '2026-11-25T10:00:00+09:00',
      digest: 'sha256:approved-content' },
  };
  return { ...book, ...overrides };
}

test('plans exactly one stable slot per field for each month, without inventing titles', () => {
  const slots = monthlyEditorialSlots('2026-11');
  assert.equal(slots.length, FIELD_CATALOG.length);
  assert.equal(slots.length, 6);
  assert.equal(new Set(slots.map(s => s.id)).size, 6);
  assert.ok(slots.every(s => s.title === null && !s.readyForSale && s.status === 'planned'));
  assert.deepEqual(slots, monthlyEditorialSlots('2026-11'));
  assert.notEqual(monthlyEditorialSlots('2026-12')[0].id, slots[0].id);
});

test('reuses persisted slot state and rejects duplicate or invalid records', () => {
  const record = { month: '2026-11', fieldId: 'literature', title: '실제 승인 원고', status: 'editing' };
  const slots = monthlyEditorialSlots('2026-11', [record]);
  assert.equal(slots[0].title, '실제 승인 원고');
  assert.equal(slots[0].status, 'editing');
  assert.throws(() => monthlyEditorialSlots('2026-11', [record, record]), /duplicate/);
  assert.throws(() => monthlyEditorialSlots('2026-13'), /YYYY-MM/);
  assert.throws(() => monthlyEditorialSlots('2026-11', [{ ...record, status: 'nonsense' }]), /unknown/);
});

test('unverified books remain blocked, with explicit reasons', () => {
  const result = evaluateReleaseReadiness({ title: '초고', readerProfiles: ['children'] });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes('rights.licenseChecked'));
  assert.ok(result.blockers.includes('audience.childReaderTested'));
  assert.ok(result.blockers.includes('publisherApproval.digest-matched'));
});

test('only verified, approved, version-bound releases create dual-channel handoffs', () => {
  const book = release();
  assert.deepEqual(evaluateReleaseReadiness(book), { ready: true, blockers: [] });
  const handoff = approvedDualChannelHandoff(book);
  assert.deepEqual(handoff.channels, ['books', 'ekodimall']);
  assert.equal(handoff.editionId, book.editionId);
  assert.equal(handoff.deliveryState, 'not_dispatched');
  assert.equal(handoff.copyrightOwnerId, book.authorId);
  assert.equal(handoff.audiobook.bundlePriceKrw, 0);
  assert.equal(handoff.audiobook.access, 'verified_purchase_only');
  assert.equal(approvedDualChannelHandoff(book).idempotencyKey, handoff.idempotencyKey);
});

test('changed content after publisher approval is not publishable', () => {
  assert.ok(evaluateReleaseReadiness(release({ releaseDigest: 'sha256:new-version' })).blockers.includes('publisherApproval.digest-matched'));
  assert.throws(() => approvedDualChannelHandoff(release({ releaseDigest: 'sha256:new-version' })), /blocked/);
});

test('children, teens, and dyslexia editions require distinct reader reviews', () => {
  const book = release({ readerProfiles: ['children', 'teen', 'dyslexia'] });
  assert.equal(evaluateReleaseReadiness(book).ready, true);
  const changed = { ...book, audience: { ...book.audience, childReaderTested: false, dyslexicReaderTested: false },
    accessibility: { ...book.accessibility, adjustableLineSpacing: false } };
  assert.deepEqual(evaluateReleaseReadiness(changed).blockers.sort(), [
    'audience.childReaderTested', 'audience.dyslexicReaderTested', 'accessibility.adjustableLineSpacing',
  ].sort());
});

test('protects the independently managed EKODIAN series', () => {
  assert.ok(evaluateReleaseReadiness(release({ collectionId: 'ekodian' })).blockers.includes('ekodian-series-excluded'));
  assert.ok(evaluateReleaseReadiness(release({ seriesId: 'EKODIAN' })).blockers.includes('ekodian-series-excluded'));
});

test('print editions also require verified proof, supplier and fulfillment', () => {
  const book = release({ format: 'print', print: { printReadyPDF: true } });
  assert.ok(evaluateReleaseReadiness(book).blockers.includes('print.proofApproved'));
  assert.equal(evaluateReleaseReadiness(release({ format: 'print' })).ready, true);
});

test('no nonsensical reader profile can bypass the accessibility gates', () => {
  assert.equal(evaluateReleaseReadiness(release({ readerProfiles: { includes: () => true } })).ready, false);
  assert.ok(evaluateReleaseReadiness(release({ readerProfiles: [] })).blockers.includes('readerProfiles'));
});

test('free tier may archive manuscript but cannot become a sale listing', () => {
  const candidate = release({ authorMembership: { planId: 'free', authorId: 'AUTHOR-1', serverVerified: true } });
  assert.ok(evaluateReleaseReadiness(candidate).blockers.includes('authorMembership.verifiedSaleEligible'));
  assert.throws(() => approvedDualChannelHandoff(candidate), /blocked/);
});

test('book copyright remains with author; publisher gets only approved distribution license', () => {
  assert.ok(evaluateReleaseReadiness(release({ rights: { licenseChecked: true, authorContractApproved: true, copyrightOwnerId: 'publisher', distributionLicenseApproved: true } })).blockers.includes('rights.authorCopyrightRetained'));
  assert.ok(evaluateReleaseReadiness(release({ rights: { licenseChecked: true, authorContractApproved: true, copyrightOwnerId: 'AUTHOR-1' } })).blockers.includes('rights.distributionLicenseApproved'));
});

test('paid royalties and sale commissions require a separate edition-specific agreement', () => {
  const absent = evaluateReleaseReadiness(release({ salesContract: null }));
  assert.ok(absent.blockers.includes('salesContract.royaltyAndCommissionSignedForEdition'));
  const publisherBook = release({
    authorMembership: { planId: 'publisher_editor', serverVerified: true, authorId: 'AUTHOR-1',
      verifiedChiefAdmin: true, publisherEditorScope: true }, salesContract: null
  });
  assert.equal(evaluateReleaseReadiness(publisherBook).ready, true);
  const unscoped = release({ authorMembership: { ...publisherBook.authorMembership, publisherEditorScope: false } });
  assert.ok(evaluateReleaseReadiness(unscoped).blockers.includes('authorMembership.verifiedPlanningScope'));
});

test('premium voice quality, paired edition and free purchaser grant are hard sales gates', () => {
  const missing = evaluateReleaseReadiness(release({ audiobook: null }));
  assert.ok(missing.blockers.includes('audiobook.qualityAndVersionApproved'));
  assert.ok(missing.blockers.includes('audiobook.freeBuyerBundleVerified'));
  const paidAudio = release({ audiobook: { ...release().audiobook, additionalBuyerPriceKrw: 1000 } });
  assert.ok(evaluateReleaseReadiness(paidAudio).blockers.includes('audiobook.freeBuyerBundleVerified'));
  const outdated = release({ audiobook: { ...release().audiobook, pairedEditionDigest: 'sha256:outdated' } });
  assert.ok(evaluateReleaseReadiness(outdated).blockers.includes('audiobook.qualityAndVersionApproved'));
});

test('broad non-monthly disciplines can be submitted without taking monthly six-field planning slots', () => {
  assert.equal(evaluateReleaseReadiness(release({ fieldId: 'theology' })).ready, true);
});
