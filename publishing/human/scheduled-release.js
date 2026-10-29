// EKODI Human Publishing — private completed editions and scheduled dual-channel release.
// Pure state transitions: NO storage, clock polling, event dispatch, payment, or public catalog writes.
// Only the publisher-controlled authenticated service may call these transitions and persist them
// atomically. Never pass user-supplied "verification" values into trustedEvidence.
import { evaluateReleaseReadiness, approvedDualChannelHandoff } from './editorial-policy.js';

export const RELEASE_CHANNELS = Object.freeze(['books', 'ekodimall']);
export const RELEASE_STATUSES = Object.freeze([
  'private_registered', 'scheduled', 'preparing', 'prepared', 'activating', 'ready_to_release', 'released', 'cancelled', 'blocked',
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const valid = str => typeof str === 'string' && str.trim() !== '';
const invariant = (ok, message) => { if (!ok) throw new Error('RELEASE_BLOCKED:' + message); };
const instant = value => {
  invariant(typeof value === 'string' && ISO_INSTANT.test(value), 'explicit-timezone-required');
  const date = new Date(value);
  invariant(Number.isFinite(date.valueOf()), 'invalid-time');
  // Date.parse may silently normalize February 30; detect invalid calendar days too.
  const [year,month,day,hour,minute,second] = value.slice(0,19).match(/\d+/g).map(Number);
  const check = new Date(Date.UTC(year,month-1,day,hour,minute,second));
  invariant(year >= 2000 && check.getUTCFullYear() === year &&
    check.getUTCMonth()+1 === month && check.getUTCDate() === day &&
    check.getUTCHours() === hour && check.getUTCMinutes() === minute &&
    check.getUTCSeconds() === second, 'invalid-time');
  return date.valueOf();
};
function assertNow(now) {
  const timestamp = typeof now === 'number' ? now : instant(now);
  invariant(Number.isFinite(timestamp), 'invalid-clock');
  return timestamp;
}
function change(record, patch, auditAction) {
  return Object.freeze({ ...record, ...patch, revision: record.revision + 1,
    lastTransition: auditAction });
}
function validAttestation(evidence, digest) {
  // Runtime must verify cryptographically with server-held keys; this only checks the
  // post-verification result. A client-controlled evidence object is never sufficient.
  return evidence?.trustedBackend === true &&
    evidence?.authorSignatureValid === true &&
    evidence?.publisherSignatureValid === true &&
    evidence?.assetDigestValid === true &&
    evidence?.rightsEvidenceValid === true &&
    evidence?.digest === digest;
}
function assertEditionMatch(record, candidate) {
  invariant(record && candidate, 'edition-required');
  for (const key of ['publicationId','editionId','title','authorId','releaseDigest']) {
    invariant(record[key] === candidate[key], 'edition-mismatch:' + key);
  }
}

/**
 * Completed manuscript/EPUB is registered only in the publisher's PRIVATE database.
 * A storage object existence check and matching immutable file digest must have been
 * performed in the trusted backend before it supplies the attestation.
 */
export function registerCompletedEdition(candidate, storageEvidence, now) {
  invariant(candidate && valid(candidate.publicationId) && valid(candidate.editionId) &&
    valid(candidate.title) && valid(candidate.authorId) &&
    HASH.test(candidate.releaseDigest || ''), 'complete-edition-metadata-required');
  invariant(storageEvidence?.trustedBackend === true &&
    storageEvidence?.privateFileVerified === true &&
    storageEvidence?.editorialCompleteVerified === true &&
    storageEvidence?.artifactDigest === candidate.releaseDigest, 'private-asset-verification-required');
  const createdAt = new Date(assertNow(now)).toISOString();
  return Object.freeze({
    publicationId: candidate.publicationId, editionId: candidate.editionId,
    title: candidate.title, authorId: candidate.authorId, releaseDigest: candidate.releaseDigest,
    state: 'private_registered', revision: 1, lastTransition: 'private-registered',
    visibility: 'private', checkoutEnabled: false, publishAt: null,
    createdAt, channels: { books: { prepared: false, activated: false },
      ekodimall: { prepared: false, activated: false } },
  });
}

/**
 * Publisher-approved release may be scheduled privately.
 * The *unmodified candidate* must pass all existing Human Publishing checks,
 * and the author + publisher signatures must match the same file digest.
 */
export function scheduleApprovedEdition(record, candidate, publishAt, trustedEvidence, now) {
  invariant(record?.state === 'private_registered' || record?.state === 'scheduled', 'not-private');
  invariant(record.visibility === 'private' && record.checkoutEnabled === false, 'premature-exposure');
  assertEditionMatch(record, candidate);
  const when = instant(publishAt);
  invariant(when > assertNow(now), 'publish-time-not-future');
  const gate = evaluateReleaseReadiness(candidate);
  invariant(gate.ready, 'editorial-gate:' + gate.blockers.join(','));
  invariant(candidate.authorApproval?.approvedBy === candidate.authorId &&
    valid(candidate.authorApproval?.approvedAt) &&
    candidate.authorApproval?.digest === record.releaseDigest, 'author-approval-required');
  invariant(valid(candidate.publisherApproval?.approvedBy) &&
    candidate.publisherApproval?.digest === record.releaseDigest, 'publisher-approval-required');
  invariant(validAttestation(trustedEvidence, record.releaseDigest), 'trusted-approval-proof-required');
  const event = approvedDualChannelHandoff(candidate);
  invariant(event.channels.length === 2 &&
    RELEASE_CHANNELS.every(c => event.channels.includes(c)), 'both-channels-required');
  return change(record, {
    state: 'scheduled', publishAt: new Date(when).toISOString(), visibility: 'private',
    checkoutEnabled: false, releaseEventKey: event.idempotencyKey,
    channels: { books: { prepared: false, activated: false }, ekodimall: { prepared: false, activated: false } },
  }, 'approved-schedule-saved');
}

/** Cron retries can only claim an unchanged, newly revalidated approved candidate. */
export function claimScheduledEdition(record, candidate, trustedEvidence, now) {
  invariant(record?.state === 'scheduled' || record?.state === 'preparing', 'not-scheduled');
  assertEditionMatch(record, candidate);
  invariant(instant(record.publishAt) <= assertNow(now), 'not-due');
  const gate = evaluateReleaseReadiness(candidate);
  invariant(gate.ready, 'editorial-gate:' + gate.blockers.join(','));
  invariant(candidate.authorApproval?.digest === record.releaseDigest &&
    candidate.authorApproval?.approvedBy === candidate.authorId, 'author-approval-invalidated');
  invariant(validAttestation(trustedEvidence, record.releaseDigest), 'trusted-approval-proof-invalidated');
  return change(record, { state: 'preparing', visibility: 'private', checkoutEnabled: false },
    'due-candidate-claimed');
}

/** Only the authenticating BOOKS or Mall service may supply the verified acknowledgement. */
export function recordPrepared(record, channel, verifiedChannelAck) {
  invariant(record?.state === 'preparing' || record?.state === 'prepared', 'not-preparing');
  invariant(RELEASE_CHANNELS.includes(channel), 'unknown-channel');
  invariant(verifiedChannelAck?.trustedBackend === true &&
    verifiedChannelAck?.channel === channel &&
    verifiedChannelAck?.releaseEventKey === record.releaseEventKey &&
    verifiedChannelAck?.releaseDigest === record.releaseDigest &&
    verifiedChannelAck?.stage === 'prepared', 'untrusted-channel-ack');
  const channels = { ...record.channels, [channel]: { ...record.channels[channel], prepared: true } };
  const all = RELEASE_CHANNELS.every(c => channels[c]?.prepared === true);
  return change(record, { channels, state: all ? 'prepared' : 'preparing',
    visibility: 'private', checkoutEnabled: false }, 'prepared:' + channel);
}

/** Activation intent is emitted only after BOTH channels staged the same edition invisibly. */
export function activationProposal(record, now) {
  invariant(record?.state === 'prepared' || record?.state === 'activating', 'not-dual-prepared');
  invariant(instant(record.publishAt) <= assertNow(now), 'not-due');
  invariant(RELEASE_CHANNELS.every(c => record.channels[c]?.prepared), 'missing-prepared-channel');
  return Object.freeze({
    eventType: 'human-publishing.edition.activate.v1',
    idempotencyKey: 'activate:' + record.releaseEventKey,
    releaseEventKey: record.releaseEventKey, releaseDigest: record.releaseDigest,
    editionId: record.editionId, publicationId: record.publicationId,
    scheduledAt: record.publishAt, channels: RELEASE_CHANNELS,
    visibility: 'still-private-until-central-release', deliveryState: 'not_dispatched',
  });
}
export function recordActivated(record, channel, verifiedChannelAck) {
  invariant(record?.state === 'prepared' || record?.state === 'activating' ||
    record?.state === 'ready_to_release', 'not-prepared-for-activation');
  invariant(RELEASE_CHANNELS.includes(channel), 'unknown-channel');
  invariant(verifiedChannelAck?.trustedBackend === true &&
    verifiedChannelAck?.channel === channel &&
    verifiedChannelAck?.releaseEventKey === record.releaseEventKey &&
    verifiedChannelAck?.releaseDigest === record.releaseDigest &&
    verifiedChannelAck?.stage === 'activated', 'untrusted-activation-ack');
  invariant(record.channels[channel]?.prepared === true, 'channel-not-prepared');
  const channels = { ...record.channels, [channel]: { ...record.channels[channel], activated: true } };
  const all = RELEASE_CHANNELS.every(c => channels[c]?.activated === true);
  return change(record, { channels, state: all ? 'ready_to_release' : 'activating',
    visibility: 'private', checkoutEnabled: false }, 'activated:' + channel);
}

/** Final central visibility grant. Each storefront MUST re-check this release gate
 * before listing/offering a title; earlier prepared/activated acks cannot expose it. */
export function grantJointPublicVisibility(record, now) {
  invariant(record?.state === 'ready_to_release', 'not-jointly-activated');
  invariant(instant(record.publishAt) <= assertNow(now), 'not-due');
  invariant(RELEASE_CHANNELS.every(c => record.channels[c]?.prepared &&
    record.channels[c]?.activated), 'missing-channel-ack');
  return change(record, { state: 'released', visibility: 'public', checkoutEnabled: true,
    releasedAt: new Date(assertNow(now)).toISOString() }, 'joint-public-release');
}
export function canExposePublicly(record, channel, now) {
  return RELEASE_CHANNELS.includes(channel) && record?.state === 'released' &&
    record.visibility === 'public' && record.checkoutEnabled === true &&
    record.channels?.[channel]?.prepared === true && record.channels?.[channel]?.activated === true &&
    typeof record.publishAt === 'string' && instant(record.publishAt) <= assertNow(now);
}

/** Editorial revision, owner cancellation or expired rights requires explicit rescheduling. */
export function cancelUnreleasedEdition(record, reason) {
  invariant(record && record.state !== 'released', 'released-edition-needs-takedown-workflow');
  invariant(valid(reason), 'cancellation-reason-required');
  return change(record, { state: 'cancelled', visibility: 'private', checkoutEnabled: false,
    releaseEventKey: null, publishAt: null }, 'cancelled:' + reason);
}
