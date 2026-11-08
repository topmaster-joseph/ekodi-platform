/**
 * EKODI native AI family: opt-in consent issuance contract.
 *
 * Inert until a separate non-elevated, OS-attested user-presence broker supplies
 * all three mandatory callbacks. Does not store keys, authenticate remotely,
 * display a UI, sign with a repo key, launch CLIs, or enable auto dispatch.
 * Real platform integration requires C2/C3-governed review if it expands auth.
 */
import {randomBytes} from 'node:crypto';
import {win32} from 'node:path';
import {canonicalFamilyConsentPayload} from './ai-family-signed-consent.mjs';

const HASH=/^[a-f0-9]{64}$/;
const PROVIDERS=new Set(['codex-cli','claude-code-cli']);
const WINDOW_MS=10*60*1000;
const error=code=>Object.freeze({ok:false,code});

export const FAMILY_CONSENT_ISSUER_POLICY=Object.freeze({
  enabledByDefault:false,
  maxConsentLifetimeMs:WINDOW_MS,
  allowPaidApi:false,
  readOnly:true,
});

export function createFamilyConsentIssuer({
  enabled=false,
  requestUserPresence,
  verifyUserPresence,
  signWithUserProtectedKey,
  clock=Date.now,
  randomNonce=()=>randomBytes(24).toString('base64url'),
}={}){
  async function issue({claim,deviceId,trustedRuntime}={}){
    if(enabled!==true)return error('CONSENT_ISSUANCE_DISABLED');
    if([requestUserPresence,verifyUserPresence,signWithUserProtectedKey]
      .some(fn=>typeof fn!=='function'))return error('TRUSTED_USER_BROKER_UNAVAILABLE');
    if(!claim?.ok||!String(claim.jobId||'').startsWith('hyb_')||
       !HASH.test(String(claim.requestKey||''))||!PROVIDERS.has(claim.provider)||
       !Number.isFinite(claim.deadlineMs))return error('CLAIM_UNVERIFIED');
    if(!deviceId||typeof deviceId!=='string'||deviceId.length>128)
      return error('DEVICE_ID_REQUIRED');
    if(!trustedRuntime||trustedRuntime.provider!==claim.provider||
       trustedRuntime.readOnly!==true||trustedRuntime.nonElevatedVerified!==true||
       trustedRuntime.oauthSubscriptionVerified!==true||trustedRuntime.binaryHashVerified!==true)
      return error('TRUSTED_RUNTIME_REQUIRED');
    if(!HASH.test(trustedRuntime.cliScriptSha256)||
       !HASH.test(trustedRuntime.nodeExecutableSha256)||
       ![trustedRuntime.nodeExecutable,trustedRuntime.cliScriptPath,trustedRuntime.readOnlyWorkspace]
         .every(x=>typeof x==='string'&&win32.isAbsolute(x)&&
           !/[\r\n"\u0000-\u001f]/.test(x)))return error('EXECUTION_PATH_UNTRUSTED');
    const now=clock();
    if(!Number.isFinite(now)||claim.deadlineMs<=now)return error('JOB_EXPIRED');
    const consentDeadline=Math.min(claim.deadlineMs,now+WINDOW_MS);
    if(consentDeadline<=now)return error('JOB_EXPIRED');
    const intent=Object.freeze({
      jobId:claim.jobId,deviceId,requestKey:claim.requestKey,provider:claim.provider,
      operation:'read-only-native-ai',expiresAt:new Date(consentDeadline).toISOString(),
    });
    try{
      // requestUserPresence must display the intent in the foreground in an
      // unprivileged user session. Remote JSON or status flags are not consent.
      const osProof=await requestUserPresence(intent);
      if(!osProof||await verifyUserPresence(osProof,intent)!==true)
        return error('USER_PRESENCE_NOT_VERIFIED');
      if(clock()>=consentDeadline)return error('USER_CONSENT_EXPIRED');
      const nonce=randomNonce();
      if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{22,96}$/.test(nonce))
        return error('NONCE_GENERATION_FAILED');
      const approval={
        version:'ekodi-ai-family-consent-v1',nonce,
        jobId:claim.jobId,deviceId,requestKey:claim.requestKey,provider:claim.provider,
        enabled:true,readOnly:true,nonElevatedVerified:true,deviceIdVerified:true,
        authMethod:'oauth_token',
        verifiedAt:new Date(now).toISOString(),
        expiresAt:new Date(consentDeadline).toISOString(),
        nodeExecutable:trustedRuntime.nodeExecutable,
        nodeExecutableSha256:trustedRuntime.nodeExecutableSha256,
        cliScriptPath:trustedRuntime.cliScriptPath,
        cliScriptSha256:trustedRuntime.cliScriptSha256,
        readOnlyWorkspace:trustedRuntime.readOnlyWorkspace,
        binaryHashVerified:true,
      };
      const canonical=canonicalFamilyConsentPayload(approval);
      if(!canonical)return error('CONSENT_CANONICALIZATION_FAILED');
      // Only the external OS-protected signing service may sign. Never accept a
      // signing key or a pre-computed signature from the network job envelope.
      const signature=await signWithUserProtectedKey(Buffer.from(canonical,'utf8'),intent);
      const bytes=Buffer.isBuffer(signature)?signature:
        typeof signature==='string'?Buffer.from(signature,'base64url'):null;
      if(!bytes||bytes.length!==64)return error('CONSENT_SIGNATURE_INVALID');
      return Object.freeze({ok:true,approval:Object.freeze({
        ...approval,signature:bytes.toString('base64url'),
      })});
    }catch{
      return error('USER_BROKER_UNAVAILABLE');
    }
  }
  return Object.freeze({issue});
}
