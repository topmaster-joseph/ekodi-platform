/** EKODI native CLI: inert, least-privilege consent broker adapter.
 * Supplies the interfaces expected by createWindowsNativeFamilySidecar.
 * It does NOT install an OS service, issue an account token, hold a private key,
 * expose a network endpoint, display a prompt or auto-enroll a node.
 * Callers must separately provide authentic OS/user-presence and SQL providers.
 */
import {createFamilyConsentIssuer} from './ai-family-consent-issuer.mjs';
import {createSignedFamilyConsentVerifier} from './ai-family-signed-consent.mjs';
import {createDurableFamilyNonceConsumer} from './ai-family-durable-nonce.mjs';

export function createNativeFamilyConsentBroker({
  enabled=false,
  requestUserPresence,
  verifyUserPresence,
  signWithUserProtectedKey,
  resolveTrustedRuntime,
  publicKey,
  durableNonceDb,
  clock=Date.now,
  randomNonce,
}={}){
  const issuer=createFamilyConsentIssuer({
    enabled,requestUserPresence,verifyUserPresence,
    signWithUserProtectedKey,clock,randomNonce,
  });
  const nonceConsumer=createDurableFamilyNonceConsumer(durableNonceDb,{clock});
  const verifier=createSignedFamilyConsentVerifier({
    publicKey,consumeNonce:nonceConsumer,clock,
  });
  async function getSignedConsent({claim,deviceId}={}){
    if(enabled!==true||typeof resolveTrustedRuntime!=='function'||
       !publicKey||!durableNonceDb)return null;
    try{
      // The trusted runtime must be resolved from local verified OS state
      // and pinned executable hashes, never the remotely supplied job JSON.
      const trustedRuntime=await resolveTrustedRuntime({claim,deviceId});
      const issued=await issuer.issue({claim,deviceId,trustedRuntime});
      return issued.ok?issued.approval:null;
    }catch{return null;}
  }
  async function verifySignedConsent(approval,{claim,deviceId}={}){
    if(enabled!==true||!publicKey||!durableNonceDb)return false;
    try{return await verifier(approval,{claim,deviceId})===true;}
    catch{return false;}
  }
  return Object.freeze({getSignedConsent,verifySignedConsent});
}
