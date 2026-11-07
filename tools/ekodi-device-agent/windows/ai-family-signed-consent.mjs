/** EKODI native runner Ed25519 consent verification.
 * Only public keys are used; the private key stays in an independent,
 * interactive-user consent broker and is never stored in this repository.
 * Replay protection MUST be durable across restarts and bound to user/device.
 */
import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {win32} from 'node:path';

const SHA=/^[a-f0-9]{64}$/;
const NONCE=/^[A-Za-z0-9_-]{22,96}$/;
const CONSENT_TTL_MS=10*60*1000;
const FIELDS=Object.freeze([
  'version','nonce','jobId','deviceId','requestKey','provider',
  'enabled','readOnly','nonElevatedVerified','deviceIdVerified',
  'authMethod','verifiedAt','expiresAt','nodeExecutable',
  'nodeExecutableSha256','cliScriptPath','cliScriptSha256',
  'readOnlyWorkspace','binaryHashVerified',
]);
export function canonicalFamilyConsentPayload(approval){
  if(!approval||typeof approval!=='object'||Array.isArray(approval))return null;
  const document={};
  for(const key of FIELDS){
    if(!Object.hasOwn(approval,key))return null;
    const value=approval[key];
    if(typeof value!=='string'&&typeof value!=='boolean')return null;
    document[key]=value;
  }
  return JSON.stringify(document);
}
export function createSignedFamilyConsentVerifier({publicKey,consumeNonce,clock=Date.now}={}){
  if(!publicKey||typeof consumeNonce!=='function')return async()=>false;
  let key;
  try{key=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);if(key.asymmetricKeyType!=='ed25519')return async()=>false;}
  catch{return async()=>false;}
  return async function verifySignedConsent(approval,{claim,deviceId}={}){
    if(!claim?.ok||!deviceId)return false;
    const canonical=canonicalFamilyConsentPayload(approval);
    if(!canonical)return false;
    const now=clock();
    const verified=Date.parse(approval.verifiedAt);
    const expires=Date.parse(approval.expiresAt);
    if(!Number.isFinite(now)||!Number.isFinite(verified)||!Number.isFinite(expires)||
      verified>now||now>=expires||expires<=verified||
      expires-verified>CONSENT_TTL_MS||now-verified>CONSENT_TTL_MS)return false;
    if(approval.version!=='ekodi-ai-family-consent-v1'||
      !NONCE.test(approval.nonce)||approval.jobId!==claim.jobId||
      approval.requestKey!==claim.requestKey||approval.provider!==claim.provider||
      approval.deviceId!==deviceId)return false;
    if(approval.enabled!==true||approval.readOnly!==true||
      approval.nonElevatedVerified!==true||approval.deviceIdVerified!==true||
      approval.binaryHashVerified!==true||approval.authMethod!=='oauth_token')return false;
    if(!SHA.test(approval.cliScriptSha256)||!SHA.test(approval.nodeExecutableSha256)||
      ![approval.nodeExecutable,approval.cliScriptPath,approval.readOnlyWorkspace]
        .every(path=>typeof path==='string'&&win32.isAbsolute(path)))return false;
    const signature=String(approval.signature||'');
    if(!/^[A-Za-z0-9_-]{80,100}$/.test(signature))return false;
    const raw=Buffer.from(signature,'base64url');
    if(raw.length!==64)return false;
    if(!verifySignature(null,Buffer.from(canonical,'utf8'),key,raw))return false;
    try{return await consumeNonce(approval.nonce,{jobId:claim.jobId,deviceId})===true;}
    catch{return false;}
  };
}
