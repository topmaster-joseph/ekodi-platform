// EKODI Human Publishing: deterministic, side-effect-free monthly editorial contract.
// This module neither writes manuscripts nor publishes books. Only the owning
// publisher service may persist jobs or deliver approved releases to other services.
export const FIELD_CATALOG = Object.freeze([
  { id: 'literature', label: '문학·에세이', readership: 'adult' },
  { id: 'humanities', label: '인문·심리·관계', readership: 'adult' },
  { id: 'business', label: '경영·창업·경제', readership: 'adult' },
  { id: 'ai-education', label: 'AI·기술·교육', readership: 'teen' },
  { id: 'local-culture', label: '지역·사회·문화', readership: 'general' },
  { id: 'life-practical', label: '생활·취미·실용', readership: 'general' },
]);
export const READER_PROFILES = Object.freeze(['general', 'children', 'teen', 'dyslexia']);
const fieldIds = new Set(FIELD_CATALOG.map(field => field.id));
const stateIds = new Set(['planned', 'research', 'draft', 'editing', 'accessibility', 'review', 'approved', 'released', 'blocked', 'deferred']);

export function assertPublicationMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError('month must be YYYY-MM');
  }
  return month;
}

/** One stable, idempotent slot per discipline each month. Never invent a title. */
export function monthlyEditorialSlots(month, existing = []) {
  assertPublicationMonth(month);
  if (!Array.isArray(existing)) throw new TypeError('existing must be an array');
  const keyed = new Map();
  for (const record of existing) {
    if (record?.month !== month || !fieldIds.has(record?.fieldId)) continue;
    const key = record.fieldId;
    if (keyed.has(key)) throw new Error('duplicate editorial slot for ' + month + '/' + key);
    if (!stateIds.has(record.status)) throw new Error('unknown publishing state for ' + key);
    keyed.set(key, record);
  }
  return FIELD_CATALOG.map(field => {
    const id = 'HUMAN-' + month.replace('-', '') + '-' + field.id;
    const previous = keyed.get(field.id);
    return Object.freeze({
      id,
      month,
      fieldId: field.id,
      fieldLabel: field.label,
      readership: field.readership,
      targetReleaseDay: month + '-25',
      status: previous?.status || 'planned',
      title: previous?.title || null,
      publicationId: previous?.publicationId || null,
      readyForSale: previous?.status === 'released' && previous?.verifiedHandoff === true,
    });
  });
}

function has(value) { return value === true; }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
const baseChecks = [
  ['rights.licenseChecked', 'rights.licenseChecked'],
  ['rights.authorContractApproved', 'rights.authorContractApproved'],
  ['originality.provenanceReviewed', 'originality.provenanceReviewed'],
  ['originality.verifiedNoUnauthorizedImitation', 'originality.verifiedNoUnauthorizedImitation'],
  ['craft.realHumanExperienceReviewed', 'craft.realHumanExperienceReviewed'],
  ['craft.characterAndMotivationReviewed', 'craft.characterAndMotivationReviewed'],
  ['craft.logicAndContinuityReviewed', 'craft.logicAndContinuityReviewed'],
  ['craft.readerFeedbackReviewed', 'craft.readerFeedbackReviewed'],
  ['craft.editorialRevisionComplete', 'craft.editorialRevisionComplete'],
  ['truth.claimsAndCitationsVerified', 'truth.claimsAndCitationsVerified'],
  ['truth.sensitiveClaimsReviewed', 'truth.sensitiveClaimsReviewed'],
  ['graphics.assetRightsChecked', 'graphics.assetRightsChecked'],
  ['graphics.visualNarrativeReviewed', 'graphics.visualNarrativeReviewed'],
  ['graphics.altTextComplete', 'graphics.altTextComplete'],
  ['accessibility.epubCheckPassed', 'accessibility.epubCheckPassed'],
  ['accessibility.acePassed', 'accessibility.acePassed'],
  ['accessibility.accessibilityMetadataReady', 'accessibility.accessibilityMetadataReady'],
  ['accessibility.logicalReadingOrder', 'accessibility.logicalReadingOrder'],
  ['accessibility.semanticNavigation', 'accessibility.semanticNavigation'],
  ['accessibility.mobileReflowVerified', 'accessibility.mobileReflowVerified'],
  ['accessibility.contrastVerified', 'accessibility.contrastVerified'],
  ['accessibility.screenReaderVerified', 'accessibility.screenReaderVerified'],
  ['accessibility.keyboardNavigationVerified', 'accessibility.keyboardNavigationVerified'],
  ['legal.identifierRequirementsVerified', 'legal.identifierRequirementsVerified'],
  ['legal.bookPricePolicyVerified', 'legal.bookPricePolicyVerified'],
  ['legal.digitalConsumerTermsReviewed', 'legal.digitalConsumerTermsReviewed'],
  ['commerce.signedEditionAssetReady', 'commerce.signedEditionAssetReady'],
  ['commerce.booksChannelConfigured', 'commerce.booksChannelConfigured'],
  ['commerce.mallChannelConfigured', 'commerce.mallChannelConfigured'],
  ['commerce.paymentAndEntitlementValidated', 'commerce.paymentAndEntitlementValidated'],
];
function pathValue(obj, path) { return path.split('.').reduce((acc, key) => acc?.[key], obj); }
function needs(obj, path, blockers) {
  if (!has(pathValue(obj, path))) blockers.push(path);
}

/**
 * All content/rights/accessibility/commercial requirements must pass;
 * the final publisher's signature must match the immutable release digest.
 * No live publication is implied by a passing result.
 */
export function evaluateReleaseReadiness(book) {
  const blockers = [];
  if (!book || typeof book !== 'object') return { ready: false, blockers: ['book.required'] };
  if (!nonempty(book.publicationId)) blockers.push('publicationId');
  if (!nonempty(book.editionId)) blockers.push('editionId');
  if (!nonempty(book.title)) blockers.push('title');
  if (!nonempty(book.authorId)) blockers.push('authorId');
  if (typeof book.fieldId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(book.fieldId)) blockers.push('fieldId');
  if (!nonempty(book.releaseDigest)) blockers.push('releaseDigest');
  if (!Number.isInteger(book.priceKrw) || book.priceKrw < 0) blockers.push('priceKrw');
  if (book.collectionId === 'ekodian' || book.seriesId === 'EKODIAN') blockers.push('ekodian-series-excluded');
  const profiles = Array.isArray(book.readerProfiles) ? book.readerProfiles : [];
  if (!profiles.length || profiles.some(x => !READER_PROFILES.includes(x))) blockers.push('readerProfiles');
  for (const [path] of baseChecks) needs(book, path, blockers);
  // Sales eligibility is verified by the publisher's own server, never the UI.
  // A free-tier personal manuscript can never produce a public sale listing.
  const membership = book.authorMembership;
  if (!['writer1', 'writer3', 'publisher_editor'].includes(membership?.planId) ||
      membership?.serverVerified !== true || membership?.authorId !== book.authorId) {
    blockers.push('authorMembership.verifiedSaleEligible');
  }
  if (membership?.planId === 'publisher_editor' &&
      (membership?.verifiedChiefAdmin !== true || membership?.publisherEditorScope !== true)) {
    blockers.push('authorMembership.verifiedPlanningScope');
  }
  if (book.rights?.copyrightOwnerId !== book.authorId) blockers.push('rights.authorCopyrightRetained');
  needs(book, 'rights.distributionLicenseApproved', blockers);
  if (membership?.planId === 'writer1' || membership?.planId === 'writer3') {
    if (book.salesContract?.verified !== true ||
        book.salesContract?.signedByAuthorId !== book.authorId ||
        book.salesContract?.editionDigest !== book.releaseDigest ||
        book.salesContract?.royaltyTermsAccepted !== true ||
        book.salesContract?.salesCommissionTermsAccepted !== true) {
      blockers.push('salesContract.royaltyAndCommissionSignedForEdition');
    }
  }
  // Every book registered for sale includes a premium, human-reviewed
  // audiobook at zero additional price for the verified purchaser.
  const audio = book.audiobook;
  if (audio?.highQualityApproved !== true || audio?.humanListeningQaPassed !== true ||
      audio?.dialogueNarrationReviewed !== true || !nonempty(audio?.masterAssetDigest) ||
      audio?.pairedEditionDigest !== book.releaseDigest) {
    blockers.push('audiobook.qualityAndVersionApproved');
  }
  if (audio?.additionalBuyerPriceKrw !== 0 ||
      audio?.buyerBundleEntitlementVerified !== true ||
      audio?.refundRevocationVerified !== true) {
    blockers.push('audiobook.freeBuyerBundleVerified');
  }
  if (profiles.includes('children')) {
    for (const path of ['audience.childAgeBandDefined', 'audience.childSafetyReviewed', 'audience.childReaderTested', 'graphics.childStoryboardReviewed']) needs(book, path, blockers);
  }
  if (profiles.includes('teen')) {
    for (const path of ['audience.teenDevelopmentReviewed', 'audience.teenReaderTested', 'audience.sensitiveSubjectAgeReviewed']) needs(book, path, blockers);
  }
  if (profiles.includes('dyslexia')) {
    for (const path of ['accessibility.userFontOverride', 'accessibility.adjustableLineSpacing', 'accessibility.nonJustifiedReadingMode', 'accessibility.textToSpeechCompatible', 'accessibility.graphicTextEquivalents', 'audience.dyslexicReaderTested']) needs(book, path, blockers);
  }
  if (book.format === 'print') {
    for (const path of ['print.printReadyPDF', 'print.proofApproved', 'print.supplierContractVerified', 'print.fulfillmentAndReturnsVerified']) needs(book, path, blockers);
  } else if (book.format !== 'epub') blockers.push('format');
  const approval = book.publisherApproval;
  if (!nonempty(approval?.approvedBy) || !nonempty(approval?.approvedAt) || !nonempty(approval?.digest) || approval?.digest !== book.releaseDigest) blockers.push('publisherApproval.digest-matched');
  return { ready: blockers.length === 0, blockers };
}

/** Approval-bound event proposal. The authenticated dispatcher must sign it before delivery. */
export function approvedDualChannelHandoff(book) {
  const outcome = evaluateReleaseReadiness(book);
  if (!outcome.ready) throw new Error('release blocked: ' + outcome.blockers.join(', '));
  return Object.freeze({
    eventType: 'human-publishing.edition.approved.v1',
    idempotencyKey: 'human-release:' + book.editionId + ':' + book.releaseDigest,
    publicationId: book.publicationId,
    editionId: book.editionId,
    title: book.title,
    authorId: book.authorId,
    fieldId: book.fieldId,
    format: book.format,
    priceKrw: book.priceKrw,
    releaseDigest: book.releaseDigest,
    copyrightOwnerId: book.authorId,
    audiobook: Object.freeze({
      bundlePriceKrw: 0,
      masterAssetDigest: book.audiobook.masterAssetDigest,
      access: 'verified_purchase_only',
      refundRevokesAccess: true,
    }),
    publisherApprovedAt: book.publisherApproval.approvedAt,
    channels: Object.freeze(['books', 'ekodimall']),
    deliveryState: 'not_dispatched',
  });
}
