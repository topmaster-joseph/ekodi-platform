// EKODI Publishing: server-only Cloudflare named WorkerEntrypoint RPC adapter.
// No HTTP route and no client-controlled principal/clock. The deployment must bind
// each destination ONLY to its corresponding named entrypoint. Do not expose
// either gate via a generic HTTP proxy, service wildcard, or browser credential.
import { verifyPrivatePublisherRelease } from './private-publisher-release-authority.js';

const ALLOWED=new Set(['books','ekodimall']);
const PRIVATE=Symbol('publisher-release-named-entrypoint');
const denied=channel=>({authorized:false,channel});
/**
 * Pure underlying adapter; callerId is selected by the trusted WorkerEntrypoint
 * code, NEVER by a parameter from Books, Mall, a request body or a public user.
 * It does not provision private D1, keys, candidate verification or the binding.
 */
export async function verifyBoundPublisherRelease(env,callerId,input,nowIso){
  if(!ALLOWED.has(callerId)||!input||typeof input!=='object'||Array.isArray(input))
    return denied(callerId);
  if(Object.hasOwn(input,'channel') && input.channel!==callerId)return denied(callerId);
  // Authenticates the *entrypoint class selected by the service binding*, not
  // client-side claims. This private Symbol is not remote-call serializable.
  const context=Object.freeze({token:PRIVATE,serviceId:callerId});
  const adapter={...env,PUBLISHING_RELEASE_AUTH:{
    verifyServiceCaller:async (ctx,request)=>{
      if(ctx?.token!==PRIVATE||ctx?.serviceId!==callerId ||
        request?.channel!==callerId ||
        request?.capability!=='publishing.release.visibility')
        return {authorized:false};
      return {authorized:true,serviceId:callerId};
    },
  }};
  const request={publicationId:input.publicationId,editionId:input.editionId,
    releaseDigest:input.releaseDigest,channel:callerId};
  return verifyPrivatePublisherRelease(adapter,request,context,nowIso);
}
