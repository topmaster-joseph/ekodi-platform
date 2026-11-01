// EKODI Orchestrator: future scheduled Publishing Worker entry.
// This module does not configure any cron trigger or service binding.
// All methods resolve via publisher-only, authenticated Worker RPC.
import { runPrivateScheduleTick } from './scheduled-release-runner.js';

const isMethod=(obj,method)=>typeof obj?.[method]==='function';
export function privateSchedulerReady(env){
  return env?.PUBLISHING_PRIVATE_RELEASE_ENABLED==='true' &&
    isMethod(env?.PUBLISHING_RELEASE_DB,'prepare') &&
    isMethod(env?.PUBLISHING_RELEASE_DB,'batch') &&
    isMethod(env?.PUBLISHING_RELEASE_VERIFIER,'loadCandidate') &&
    isMethod(env?.PUBLISHING_RELEASE_VERIFIER,'verifyApprovalEvidence') &&
    isMethod(env?.PUBLISHING_RELEASE_VERIFIER,'verifyChannelAck') &&
    isMethod(env?.PUBLISHING_RELEASE_CHANNELS,'prepare') &&
    isMethod(env?.PUBLISHING_RELEASE_CHANNELS,'activate');
}
const safeAck=async (env,reply,record,channel,stage)=>{
  // External channel acknowledgements are UNTRUSTED until publisher's verifier
  // checks their signature, digest, channel, event key, and stage.
  const proof=await env.PUBLISHING_RELEASE_VERIFIER.verifyChannelAck({
    reply,editionId:record.editionId,releaseDigest:record.releaseDigest,
    releaseEventKey:record.releaseEventKey,channel,stage,
  });
  if(proof?.valid!==true)return null;
  return {
    trustedBackend:true,channel,stage,
    releaseEventKey:record.releaseEventKey,releaseDigest:record.releaseDigest,
  };
};
export async function runConfiguredPublishingReleaseTick(env,nowIso){
  if(!privateSchedulerReady(env))return { disabled:true, processed:0, results:[] };
  const verifier=env.PUBLISHING_RELEASE_VERIFIER;
  return runPrivateScheduleTick({
    db:env.PUBLISHING_RELEASE_DB,nowIso,max:20,
    loadCandidate:record=>verifier.loadCandidate(record.editionId),
    verifyEvidence:(record,candidate)=>verifier.verifyApprovalEvidence(record,candidate),
    prepareChannel:async(channel,record,candidate)=>{
      const reply=await env.PUBLISHING_RELEASE_CHANNELS.prepare({
        channel,editionId:record.editionId,publicationId:record.publicationId,
        releaseDigest:record.releaseDigest,releaseEventKey:record.releaseEventKey,
        candidate,visible:false,checkoutEnabled:false,
      });
      return safeAck(env,reply,record,channel,'prepared');
    },
    activateChannel:async(channel,record,candidate,event)=>{
      const reply=await env.PUBLISHING_RELEASE_CHANNELS.activate({
        channel,editionId:record.editionId,publicationId:record.publicationId,
        releaseDigest:record.releaseDigest,releaseEventKey:record.releaseEventKey,
        event,candidate,visible:false,checkoutEnabled:false,
      });
      return safeAck(env,reply,record,channel,'activated');
    },
  });
}
