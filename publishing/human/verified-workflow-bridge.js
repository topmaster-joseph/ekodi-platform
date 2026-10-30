/**
 * PUBLISH-BOUNDARY-BRIDGE-001 — private, trusted-Worker-only adapter.
 *
 * Bridges the editor's raw SHA-256/UUID:vN contract to private scheduling's
 * sha256:HEX/UUID-vN contract. Never treats a browser JSON property, approval
 * boolean, or an unsigned handoff proposal as evidence of commercial approval.
 *
 * Required upstream RPCs MUST be secured server-only bindings. This adapter
 * does not create signatures, grant sales rights, publish a listing or dispatch.
 */
import { evaluateReleaseReadiness } from './editorial-policy.js';

const RAW=/^[0-9a-f]{64}$/;
const PREFIXED=/^sha256:[0-9a-f]{64}$/;
const EDITION=/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):v([1-9][0-9]{0,3})$/i;
const SAFE_CHANNELS=new Set(['books','ekodimall']);
const STAGES=new Set(['publisher_approved','scheduled','handoff_ready']);
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const string=x=>typeof x==='string'&&x.length>0&&x.length<=180;
function hashValue(value,raw){
  if(value===raw || value==='sha256:'+raw)return 'sha256:'+raw;
  throw new Error('EDITION_DIGEST_MISMATCH');
}
function stableJson(value,depth=0){
  if(depth>12)throw new Error('SNAPSHOT_TOO_DEEP');
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value)){
    if(value.length>1000)throw new Error('SNAPSHOT_TOO_LARGE');
    return '['+value.map(x=>stableJson(x,depth+1)).join(',')+']';
  }
  if(!isObj(value))throw new Error('SNAPSHOT_INVALID');
  const keys=Object.keys(value).sort();
  if(keys.length>500)throw new Error('SNAPSHOT_TOO_LARGE');
  return '{'+keys.map(k=>JSON.stringify(k)+':'+stableJson(value[k],depth+1)).join(',')+'}';
}
async function sha256(text){
  if(text.length>200000)throw new Error('SNAPSHOT_TOO_LARGE');
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function privateEditionId(sourceId){
  const match=typeof sourceId==='string' ? EDITION.exec(sourceId) : null;
  if(!match)throw new Error('SOURCE_EDITION_ID_INVALID');
  return match[1].toLowerCase()+'-v'+match[2];
}
export function workflowEditionId(privateId){
  if(typeof privateId!=='string')throw new Error('PRIVATE_EDITION_ID_INVALID');
  const m=/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-v([1-9][0-9]{0,3})$/i.exec(privateId);
  if(!m)throw new Error('PRIVATE_EDITION_ID_INVALID');
  return m[1].toLowerCase()+':v'+m[2];
}
function versionBoundSnapshot(snapshot,sourceEditionId){
  const p=snapshot?.project;
  if(!isObj(p)||!isObj(p.releaseCandidate)||!RAW.test(p.releaseDigest||'')||
    !STAGES.has(p.stage)||!string(p.title)||!string(p.authorUserId)||
    !string(p.fieldId)||!string(p.collectionId)||
    !Number.isSafeInteger(p.revision)||p.revision<1||
    typeof p.id!=='string'||p.editionId!==sourceEditionId||
    !EDITION.test(p.editionId)||p.id.toLowerCase()!==EDITION.exec(p.editionId)[1].toLowerCase())
    throw new Error('UNAPPROVED_OR_MALFORMED_WORKFLOW');
  const source={projectId:p.id,sourceEditionId:p.editionId,authorUserId:p.authorUserId,
    title:p.title,fieldId:p.fieldId,collectionId:p.collectionId,
    stage:p.stage,releaseDigest:p.releaseDigest,revision:p.revision,
    authorApproval:p.authorApproval,publisherApproval:p.publisherApproval,
    releaseCandidate:p.releaseCandidate};
  const approval=p.authorApproval,publisher=p.publisherApproval;
  if(!isObj(approval)||approval.approvedBy!==p.authorUserId||
    approval.actor!==p.authorUserId||approval.digest!==p.releaseDigest||
    !string(approval.approvedAt)||!isObj(publisher)||
    !string(publisher.approvedBy)||publisher.digest!==p.releaseDigest||
    !string(publisher.approvedAt))throw new Error('AUTHOR_PUBLISHER_APPROVAL_MISMATCH');
  return source;
}
function approvedCandidate(source,proof){
  const raw=source.releaseDigest,quality=source.releaseCandidate;
  const audio=quality.audiobook;
  if(!isObj(audio)||!isObj(quality.rights))throw new Error('RELEASE_QA_REQUIRED');
  const candidate={
    ...quality,
    publicationId:source.projectId,
    editionId:privateEditionId(source.sourceEditionId),
    title:source.title,authorId:source.authorUserId,
    fieldId:source.fieldId,collectionId:source.collectionId,
    releaseDigest:'sha256:'+raw,
    // Only a trusted, fresh workflow verification may attest the membership,
    // separate rights contract and paid audiobook metadata in quality.
    authorApproval:{approvedBy:source.authorApproval.approvedBy,
      approvedAt:source.authorApproval.approvedAt,digest:'sha256:'+raw},
    publisherApproval:{approvedBy:source.publisherApproval.approvedBy,
      approvedAt:source.publisherApproval.approvedAt,digest:'sha256:'+raw},
    audiobook:{...audio,pairedEditionDigest:hashValue(audio.pairedEditionDigest,raw)},
  };
  if(isObj(quality.salesContract)){
    candidate.salesContract={...quality.salesContract,
      editionDigest:hashValue(quality.salesContract.editionDigest,raw)};
  }
  if(isObj(quality.authorMembership)){
    candidate.authorMembership={...quality.authorMembership,authorId:source.authorUserId};
  }
  // No field from a purported workflow record can enable store checkout.
  delete candidate.checkoutEnabled;delete candidate.visibility;delete candidate.published;
  delete candidate.releaseReady;delete candidate.saleReady;
  if(proof?.paidAuthorVerified!==true||proof?.commercialContractVerified!==true||
    proof?.audiobookVerified!==true)return null;
  const gate=evaluateReleaseReadiness(candidate);
  return gate.ready?candidate:null;
}
/**
 * Returns an adapter with the method names expected by #6638.
 * All three bindings are publisher-private and independently authenticated.
 */
export function createVerifiedPublishingWorkflowBridge({workflow,privateAssets,channelReceipts}={}){
  async function current(privateId){
    if(typeof workflow?.getApprovedEdition!=='function'||
      typeof workflow?.verifyApprovedEdition!=='function')return null;
    try{
      const sourceEditionId=workflowEditionId(privateId);
      const snapshot=await workflow.getApprovedEdition({sourceEditionId});
      const source=versionBoundSnapshot(snapshot,sourceEditionId);
      if(privateEditionId(source.sourceEditionId)!==privateId)return null;
      const candidateSha256=await sha256(stableJson(source));
      const proof=await workflow.verifyApprovedEdition({
        projectId:source.projectId,sourceEditionId,
        releaseDigest:source.releaseDigest,revision:source.revision,candidateSha256,
      });
      if(!isObj(proof)||proof.trustedBackend!==true||
        proof.projectId!==source.projectId||
        proof.sourceEditionId!==source.sourceEditionId||
        proof.releaseDigest!==source.releaseDigest||
        proof.revision!==source.revision||
        proof.candidateSha256!==candidateSha256||
        proof.authorSignatureValid!==true||
        proof.publisherSignatureValid!==true||
        proof.assetDigestValid!==true||
        proof.rightsEvidenceValid!==true)return null;
      const candidate=approvedCandidate(source,proof);
      return candidate?{candidate,source,proof}:null;
    }catch{return null;}
  }
  return Object.freeze({
    async loadCandidate(privateId){
      return (await current(privateId))?.candidate||null;
    },
    async verifyCompletedFile(candidate){
      if(typeof privateAssets?.verifyImmutableEdition!=='function'||!isObj(candidate))return null;
      const live=await current(candidate.editionId);
      if(!live||stableJson(live.candidate)!==stableJson(candidate))return null;
      try{
        const result=await privateAssets.verifyImmutableEdition({
          editionId:candidate.editionId,releaseDigest:candidate.releaseDigest,
          publicationId:candidate.publicationId,
        });
        if(result?.trustedBackend!==true||
          result?.privateFileVerified!==true||
          result?.artifactDigest!==candidate.releaseDigest||
          result?.editionId!==candidate.editionId)return null;
        return {trustedBackend:true,privateFileVerified:true,
          editorialCompleteVerified:true,artifactDigest:candidate.releaseDigest};
      }catch{return null;}
    },
    async verifyApprovalEvidence(record,candidate){
      if(!isObj(record)||!isObj(candidate))return null;
      const live=await current(record.editionId);
      if(!live||stableJson(live.candidate)!==stableJson(candidate)||
        record.editionId!==candidate.editionId||
        record.publicationId!==candidate.publicationId||
        record.authorId!==candidate.authorId||
        record.title!==candidate.title||
        record.releaseDigest!==candidate.releaseDigest)return null;
      // Fresh private storage check on every schedule and retry.
      if(typeof privateAssets?.verifyImmutableEdition!=='function')return null;
      try {
        const proof=await privateAssets.verifyImmutableEdition({
          editionId:candidate.editionId,releaseDigest:candidate.releaseDigest,
          publicationId:candidate.publicationId,
        });
        if(proof?.trustedBackend!==true||proof?.privateFileVerified!==true||
          proof?.editionId!==candidate.editionId||
          proof?.artifactDigest!==candidate.releaseDigest)return null;
        return {trustedBackend:true,authorSignatureValid:true,
          publisherSignatureValid:true,assetDigestValid:true,
          rightsEvidenceValid:true,digest:candidate.releaseDigest};
      }catch{return null;}
    },
    async verifyChannelAck(input){
      if(!isObj(input)||!SAFE_CHANNELS.has(input.channel)||
        !PREFIXED.test(input.releaseDigest||'')||
        !['prepared','activated'].includes(input.stage)||
        !string(input.releaseEventKey)||
        typeof channelReceipts?.verifySignedAck!=='function')return {valid:false};
      try {
        const p=await channelReceipts.verifySignedAck(input);
        return {valid:p?.trustedBackend===true&&p?.valid===true&&
          p.channel===input.channel&&p.editionId===input.editionId&&
          p.releaseDigest===input.releaseDigest&&p.releaseEventKey===input.releaseEventKey&&
          p.stage===input.stage};
      }catch{return {valid:false};}
    },
  });
}
