// EKODI Orchestrator: private publisher's read-only authoritative release attestation.
// This is NOT an HTTP endpoint, public URL, service binding, or automatic sale.
// A protected Publisher Worker RPC adapter must authenticate the calling service,
// provision the private DB and verifier, and call this function server-side.
// Every denied result is non-disclosing and fail-closed.
import { readPrivateEdition } from './private-release-store.js';
import { canExposePublicly, RELEASE_CHANNELS } from './scheduled-release.js';

const SHA=/^sha256:[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const denied=channel=>Object.freeze({authorized:false,channel:
  RELEASE_CHANNELS.includes(channel)?channel:null});
const validRequest=input=>input&&
  ID.test(input.publicationId||'')&&ID.test(input.editionId||'')&&
  SHA.test(input.releaseDigest||'')&&RELEASE_CHANNELS.includes(input.channel);
const rightsValid=(v,digest)=>v?.trustedBackend===true&&
  v.authorSignatureValid===true&&v.publisherSignatureValid===true&&
  v.assetDigestValid===true&&v.rightsEvidenceValid===true&&v.digest===digest;
const same=(r,input)=>r?.publicationId===input.publicationId&&
  r?.editionId===input.editionId&&r?.releaseDigest===input.releaseDigest;

/**
 * A *separate trusted RPC layer* supplies callerContext from its authenticated
 * Cloudflare service binding, never from user JSON, Origin, cookie or email.
 * verifyServiceCaller must cryptographically/operationally authorize a caller
 * for the requested channel. Never enable this via an internet-facing route.
 * The verifier and asset store must be private to the publisher.
 */
export async function verifyPrivatePublisherRelease(env,input,callerContext,nowIso){
  const no=denied(input?.channel);
  if(!validRequest(input) ||
     env?.PUBLISHING_PRIVATE_RELEASE_ENABLED!=='true' ||
     typeof env?.PUBLISHING_RELEASE_DB?.prepare!=='function' ||
     typeof env?.PUBLISHING_RELEASE_AUTH?.verifyServiceCaller!=='function' ||
     typeof env?.PUBLISHING_RELEASE_VERIFIER?.loadCandidate!=='function' ||
     typeof env?.PUBLISHING_RELEASE_VERIFIER?.verifyApprovalEvidence!=='function')return no;
  // Clock is supplied by the trusted Worker, not by the shopping client.
  if(typeof nowIso!=='string' || !/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/.test(nowIso) ||
    !Number.isFinite(Date.parse(nowIso)))return no;
  try{
    const caller=await env.PUBLISHING_RELEASE_AUTH.verifyServiceCaller(callerContext,{
      capability:'publishing.release.visibility',channel:input.channel,
    });
    if(caller?.authorized!==true || !['books','ekodimall'].includes(caller?.serviceId) ||
       caller.serviceId!==input.channel)return no;
    let record=await readPrivateEdition(env.PUBLISHING_RELEASE_DB,input.editionId);
    if(!same(record,input) || !canExposePublicly(record,input.channel,nowIso))return no;
    // Both channel receipts must correspond to this immutable release.
    if(!RELEASE_CHANNELS.every(ch=>record.channels?.[ch]?.prepared===true&&
        record.channels?.[ch]?.activated===true) ||
        typeof record.releaseEventKey!=='string'||!record.releaseEventKey)return no;
    const snapshotRevision=record.revision;
    const candidate=await env.PUBLISHING_RELEASE_VERIFIER.loadCandidate(record.editionId);
    if(!candidate || candidate.editionId!==record.editionId ||
       candidate.publicationId!==record.publicationId ||
       candidate.releaseDigest!==record.releaseDigest ||
       candidate.title!==record.title || candidate.authorId!==record.authorId)return no;
    const evidence=await env.PUBLISHING_RELEASE_VERIFIER.verifyApprovalEvidence(record,candidate);
    if(!rightsValid(evidence,record.releaseDigest) ||
       candidate.authorApproval?.digest!==record.releaseDigest ||
       candidate.authorApproval?.approvedBy!==record.authorId ||
       candidate.publisherApproval?.digest!==record.releaseDigest)return no;
    // Check canonical record again after the external rights/candidate validation.
    record=await readPrivateEdition(env.PUBLISHING_RELEASE_DB,input.editionId);
    if(record?.revision!==snapshotRevision || !same(record,input) ||
       !canExposePublicly(record,input.channel,nowIso))return no;
    return Object.freeze({
      authorized:true,state:'released',visibility:'public',checkoutEnabled:true,
      channel:input.channel,publicationId:record.publicationId,
      editionId:record.editionId,releaseDigest:record.releaseDigest,
    });
  }catch{
    // Never disclose whether an edition, rights contract or user exists.
    return no;
  }
}
