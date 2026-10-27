import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_CATALOG, monthlyEditorialSlots, evaluateReleaseReadiness, approvedDualChannelHandoff } from '../publishing/human/editorial-policy.js';

function release(overrides = {}) {
  const book = {
    publicationId: 'HP-001', editionId: 'HP-001-EPUB-1', title: '완성된 독립 작품',
    authorId: 'AUTHOR-1', fieldId: 'literature', format: 'epub', priceKrw: 9900,
    releaseDigest: 'sha256:approved-content', readerProfiles: ['general'], collectionId: 'human',
    rights: { licenseChecked: true, authorContractApproved: true },
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
