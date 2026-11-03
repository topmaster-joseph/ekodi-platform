// EKODI Jubilee Theology Series: side-effect-free, fail-closed editorial review gate.
// Does NOT persist files, authenticate authors, publish, activate payment, or dispatch events.
// A trusted publisher service must verify author/publisher signatures before an approved event.
import { evaluateReleaseReadiness } from '../human/editorial-policy.js';

export const JUBILEE_SERIES_ID = 'EKODI-JUBILEE-THEOLOGY';
const REQUIRED_VOLUME_TYPES = Object.freeze(['academic-theology', 'general-theology']);
const REVIEW_STATES = new Set(['citation-and-rights-review', 'literary-and-rights-review', 'blocked', 'deferred']);
const SAFE_ID = /^EJT-0[12]-REVIEW$/;

/** Registry contains draft metadata only, never release or customer-facing products. */
export function inspectJubileeDraftRegistry(registry, catalog = { books: [] }) {
  const blockers = [];
  if (registry?.seriesId !== JUBILEE_SERIES_ID) blockers.push('seriesId');
  if (registry?.visibility !== 'private-editorial-review') blockers.push('visibility');
  if (registry?.publicCatalog !== false) blockers.push('publicCatalog');
  if (registry?.commercialActivation !== false) blockers.push('commercialActivation');
  const records = Array.isArray(registry?.volumes) ? registry.volumes : [];
  if (records.length !== 2) blockers.push('exactly-two-volumes');
  const ids = new Set(), numbers = new Set();
  const existingIds = new Set((Array.isArray(catalog?.books) ? catalog.books : []).map(b => b.id));
  for (const v of records) {
    if (!v || !SAFE_ID.test(v.reviewId || '')) blockers.push('reviewId');
    if (ids.has(v?.reviewId)) blockers.push('duplicate-reviewId');
    ids.add(v?.reviewId);
    if (![1, 2].includes(v?.volumeNumber) || numbers.has(v?.volumeNumber)) blockers.push('volumeNumber');
    numbers.add(v?.volumeNumber);
    if (v?.genre !== REQUIRED_VOLUME_TYPES[v?.volumeNumber - 1]) blockers.push('genre');
    if (v?.fieldId !== 'humanities') blockers.push('fieldId'); // compat only; NOT a monthly publishing slot
    if (v?.author !== '정찬균' || !String(v?.title || '').trim()) blockers.push('author-or-title');
    if (!REVIEW_STATES.has(v?.stage)) blockers.push('review-stage');
    if (v?.sourceAssetLocation !== 'private-external-not-linked') blockers.push('private-asset-pointer');
    for (const field of ['publicationId', 'editionId', 'isbn', 'priceKrw', 'publicUrl']) {
      if (v?.[field] !== null) blockers.push('no-draft-' + field);
    }
    if (v?.checkoutEnabled !== false || v?.authorFinalApproval !== false || v?.publisherFinalApproval !== false)
      blockers.push('release-gate-closed');
    if (existingIds.has(v?.reviewId)) blockers.push('published-catalog-id-collision');
  }
  return Object.freeze({
    validDraft: blockers.length === 0,
    readyForPublication: false, // no draft alone can ever be a releasable artifact
    blockers: Object.freeze([...new Set(blockers)]),
    reviewIds: Object.freeze([...ids]),
  });
}

/**
 * Only a proposed immutable candidate is assessed, NOT this draft registry.
 * serverVerified is evidence from the authenticated publisher backend; it is
 * not safe to trust a client-supplied boolean or a GitHub JSON field as proof.
 */
export function evaluateJubileeReleaseCandidate(reviewRecord, candidate, serverVerified = null) {
  const blockers = [];
  if (!reviewRecord || !SAFE_ID.test(reviewRecord.reviewId || '')) blockers.push('review-record');
  if (candidate?.seriesId !== JUBILEE_SERIES_ID) blockers.push('seriesId');
  if (candidate?.reviewId !== reviewRecord?.reviewId) blockers.push('reviewId');
  if (candidate?.title !== reviewRecord?.title) blockers.push('title');
  if (candidate?.format !== 'epub') blockers.push('format');
  if (candidate?.fieldId !== 'humanities') blockers.push('fieldId');
  if (candidate?.collectionId === 'ekodian' || candidate?.seriesId === 'EKODIAN') blockers.push('ekodian-isolation');
  if (candidate?.authorApproval?.digest !== candidate?.releaseDigest ||
      !candidate?.authorApproval?.approvedAt ||
      candidate?.authorApproval?.approvedBy !== candidate?.authorId) blockers.push('authorApproval.digest-matched');
  if (serverVerified?.authorSignatureValid !== true ||
      serverVerified?.publisherSignatureValid !== true ||
      serverVerified?.assetDigestValid !== true) blockers.push('trusted-signature-and-asset-evidence');
  const base = evaluateReleaseReadiness(candidate);
  return Object.freeze({ ready: blockers.length === 0 && base.ready,
    blockers: Object.freeze([...new Set([...blockers, ...base.blockers])]) });
}
