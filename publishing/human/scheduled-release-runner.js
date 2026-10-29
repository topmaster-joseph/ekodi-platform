// Publisher-side scheduled release coordinator. Execution requires a protected, 
// authenticated Publishing Worker with its own private DB, signed channel adapters,
// and a configured cron. This module alone does not schedule or publish anything.
import {
  claimScheduledEdition, recordPrepared, activationProposal,
  recordActivated, grantJointPublicVisibility, canExposePublicly, RELEASE_CHANNELS,
} from './scheduled-release.js';
import { readPrivateEdition, savePrivateTransition, listDuePrivateEditions } from './private-release-store.js';

const ready = f => typeof f === 'function';
const invariant = (ok, reason) => { if (!ok) throw new Error('RELEASE_RUNNER:' + reason); };

/**
 * All callback values MUST originate from server-side protected interfaces:
 * loadCandidate reads an immutable, private, signed approval snapshot;
 * verifyEvidence checks author/publisher signatures, rights and stored file digest;
 * prepare/activate are authenticated idempotent adapters, not public storefront APIs.
 * The consumers MUST consult getPublicVisibility before showing any product or buy UI.
 */
export async function runPrivateScheduleTick({
  db, nowIso, loadCandidate, verifyEvidence, prepareChannel, activateChannel, max=20,
}) {
  invariant(db?.prepare && ready(loadCandidate) && ready(verifyEvidence) &&
    ready(prepareChannel) && ready(activateChannel), 'trusted-adapters-required');
  const results=[];
  const due=await listDuePrivateEditions(db,nowIso,max);
  for (const queued of due) {
    let record=await readPrivateEdition(db,queued.editionId);
    if (!record || record.state === 'released' || record.state === 'cancelled') continue;
    try {
      const candidate=await loadCandidate(record);
      const evidence=await verifyEvidence(record,candidate);
      // The backend verifies cryptographic evidence; any revoked approval must stop processing.
      invariant(evidence?.trustedBackend === true, 'verification-unavailable');
      const save=async next=>{
        await savePrivateTransition(db,record,next,nowIso);
        record=next;
      };
      if (record.state === 'scheduled') {
        await save(claimScheduledEdition(record,candidate,evidence,nowIso));
      }
      if (record.state === 'preparing') {
        // A resumed/retried delivery must be revalidated every tick.
        await save(claimScheduledEdition(record,candidate,evidence,nowIso));
        for (const channel of RELEASE_CHANNELS) {
          if (record.channels[channel].prepared) continue;
          const response=await prepareChannel(channel,record,candidate);
          await save(recordPrepared(record,channel,response));
        }
      }
      if (record.state === 'prepared' || record.state === 'activating') {
        const proposal=record.state === 'prepared' ? activationProposal(record,nowIso) : null;
        for (const channel of RELEASE_CHANNELS) {
          if (record.channels[channel].activated) continue;
          const response=await activateChannel(channel,record,candidate,proposal);
          await save(recordActivated(record,channel,response));
        }
      }
      if (record.state === 'ready_to_release') {
        const finalEvidence=await verifyEvidence(record,candidate);
        invariant(finalEvidence?.trustedBackend === true &&
          finalEvidence?.assetDigestValid === true &&
          finalEvidence?.authorSignatureValid === true &&
          finalEvidence?.publisherSignatureValid === true &&
          finalEvidence?.rightsEvidenceValid === true &&
          finalEvidence?.digest === record.releaseDigest,'approval-revoked-before-publication');
        await save(grantJointPublicVisibility(record,nowIso));
      }
      results.push({ editionId:record.editionId,state:record.state,ok:record.state === 'released' });
    } catch (e) {
      // Fail closed. The last saved state remains private, allowing a later idempotent retry.
      results.push({ editionId:record.editionId,state:record.state,ok:false,error:String(e.message||e).slice(0,200) });
    }
  }
  return { processed:results.length,results };
}

/** Public consumers MUST use a trusted service binding, not an unauthenticated fetch.
 * Inability to read the canonical ledger must be interpreted as NOT PUBLIC. */
export async function getPublicVisibility(db,editionId,channel,nowIso) {
  try {
    const r=await readPrivateEdition(db,editionId);
    return Boolean(r && canExposePublicly(r,channel,nowIso));
  } catch { return false; }
}
