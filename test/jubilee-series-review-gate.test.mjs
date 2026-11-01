import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectJubileeDraftRegistry, evaluateJubileeReleaseCandidate, JUBILEE_SERIES_ID } from '../publishing/jubilee-series/review-gate.js';

const draft = JSON.parse(readFileSync(new URL('../publishing/jubilee-series/draft-registry.json', import.meta.url), 'utf8'));
const currentCatalog = { books: [{ id: 'BOOK-EKODI-000001' }, { id: 'BOOK-EKODI-000002' }] };
const clone = value => JSON.parse(JSON.stringify(value));

function candidate(review) {
  const digest = 'sha256:verified-approved-epub';
  return {
    seriesId: JUBILEE_SERIES_ID, reviewId: review.reviewId, title: review.title,
    publicationId: 'TEST-PUBLICATION', editionId: 'TEST-EPUB-1', authorId: 'AUTHOR-TEST',
    fieldId: 'humanities', collectionId: 'jubilee-theology', format: 'epub',
    priceKrw: 9900, releaseDigest: digest, readerProfiles: ['general'],
    rights: { licenseChecked: true, authorContractApproved: true },
    originality: { provenanceReviewed: true, verifiedNoUnauthorizedImitation: true },
    craft: { realHumanExperienceReviewed: true, characterAndMotivationReviewed: true,
      logicAndContinuityReviewed: true, readerFeedbackReviewed: true, editorialRevisionComplete: true },
    truth: { claimsAndCitationsVerified: true, sensitiveClaimsReviewed: true },
    graphics: { assetRightsChecked: true, visualNarrativeReviewed: true, altTextComplete: true },
    accessibility: { epubCheckPassed: true, acePassed: true, accessibilityMetadataReady: true,
      logicalReadingOrder: true, semanticNavigation: true, mobileReflowVerified: true,
      contrastVerified: true, screenReaderVerified: true, keyboardNavigationVerified: true },
    legal: { identifierRequirementsVerified: true, bookPricePolicyVerified: true,
      digitalConsumerTermsReviewed: true },
    commerce: { signedEditionAssetReady: true, booksChannelConfigured: true,
      mallChannelConfigured: true, paymentAndEntitlementValidated: true },
    publisherApproval: { approvedBy: 'PUBLISHER-TEST', approvedAt: '2026-10-29T11:00:00+09:00', digest },
    authorApproval: { approvedBy: 'AUTHOR-TEST', approvedAt: '2026-10-29T10:00:00+09:00', digest },
  };
}
const syntheticVerified = { authorSignatureValid: true, publisherSignatureValid: true, assetDigestValid: true };

test('two distinct Jubilee Theology draft records stay isolated from current books and EKODIAN', () => {
  const result = inspectJubileeDraftRegistry(draft, currentCatalog);
  assert.equal(result.validDraft, true, result.blockers.join(','));
  assert.equal(result.readyForPublication, false);
  assert.deepEqual(draft.volumes.map(v => v.genre), ['academic-theology','general-theology']);
  assert.deepEqual(draft.volumes.map(v => v.volumeNumber), [1,2]);
  assert.equal(draft.seriesId, JUBILEE_SERIES_ID);
  assert.ok(draft.volumes.every(v => v.publicUrl === null && v.checkoutEnabled === false));
  assert.ok(draft.volumes.every(v => v.publicationId === null && v.priceKrw === null));
});

test('a leaked catalog pointer, price, sales flag, or claimed approval invalidates a draft', () => {
  for (const mutation of [
    v => { v.publicUrl = 'https://ekodi.kr/books'; },
    v => { v.priceKrw = 9900; },
    v => { v.checkoutEnabled = true; },
    v => { v.authorFinalApproval = true; },
    v => { v.sourceAssetLocation = 'public-github-url'; },
  ]) {
    const changed = clone(draft);
    mutation(changed.volumes[0]);
    const verdict = inspectJubileeDraftRegistry(changed, currentCatalog);
    assert.equal(verdict.validDraft, false);
    assert.equal(verdict.readyForPublication, false);
  }
});

test('wrong volume genre, duplicated ID, and malformed schema remain blocked', () => {
  const wrongGenre = clone(draft);
  wrongGenre.volumes[0].genre = 'general-theology';
  assert.equal(inspectJubileeDraftRegistry(wrongGenre).validDraft, false);
  const dup = clone(draft);
  dup.volumes[1].reviewId = dup.volumes[0].reviewId;
  assert.equal(inspectJubileeDraftRegistry(dup).validDraft, false);
  assert.equal(inspectJubileeDraftRegistry(null).validDraft, false);
});

test('unapproved candidate cannot pass existing Human Publishing gates', () => {
  const verdict = evaluateJubileeReleaseCandidate(draft.volumes[0], {
    seriesId:JUBILEE_SERIES_ID,reviewId:draft.volumes[0].reviewId,title:draft.volumes[0].title
  });
  assert.equal(verdict.ready, false);
  assert.ok(verdict.blockers.includes('authorApproval.digest-matched'));
  assert.ok(verdict.blockers.includes('trusted-signature-and-asset-evidence'));
  assert.ok(verdict.blockers.includes('rights.licenseChecked'));
});

test('even completed editorial checkboxes cannot bypass server signature checks', () => {
  const good = candidate(draft.volumes[0]);
  const verdict = evaluateJubileeReleaseCandidate(draft.volumes[0], good);
  assert.equal(verdict.ready, false);
  assert.ok(verdict.blockers.includes('trusted-signature-and-asset-evidence'));
  // Editorial checkboxes and even a synthetic signature claim must not bypass
  // the newer publisher-owned membership, rights and free-audiobook sale gates.
  const asserted = evaluateJubileeReleaseCandidate(draft.volumes[0], good, syntheticVerified);
  assert.equal(asserted.ready, false);
  for (const required of [
    'authorMembership.verifiedSaleEligible',
    'rights.authorCopyrightRetained',
    'rights.distributionLicenseApproved',
    'audiobook.qualityAndVersionApproved',
    'audiobook.freeBuyerBundleVerified',
  ]) {
    assert.ok(verdict.blockers.includes(required), required);
    assert.ok(asserted.blockers.includes(required), required);
  }
  assert.ok(!asserted.blockers.includes('trusted-signature-and-asset-evidence'));
});

test('a changed manuscript digest or disabled rights check invalidates old approvals', () => {
  const good = candidate(draft.volumes[1]);
  assert.ok(evaluateJubileeReleaseCandidate(draft.volumes[1], { ...good, releaseDigest:'sha256:new' }, syntheticVerified).blockers.includes('authorApproval.digest-matched'));
  assert.ok(evaluateJubileeReleaseCandidate(draft.volumes[1], { ...good, rights: { ...good.rights, licenseChecked:false } }, syntheticVerified).blockers.includes('rights.licenseChecked'));
  assert.ok(evaluateJubileeReleaseCandidate(draft.volumes[1], { ...good, title:'unapproved changed title' }, syntheticVerified).blockers.includes('title'));
});
