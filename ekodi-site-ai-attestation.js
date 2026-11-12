// EKODI Site AI: crypto-checkable activity evidence, not an execution or identity grant.
// Cloudflare Worker + Node compatible. Trust anchor MUST come from server-side authority,
// never from a caller-supplied heartbeat, site URL, or unauthenticated AI response.
export const SITE_AI_HEARTBEAT_CONTRACT = 'ekodi.site-ai.heartbeat.v1';
const DOMAIN = 'EKODI-SITE-AI-HEARTBEAT-V1\n';
const FIELDS = ['contract','siteId','workspaceId','agentId','keyId','sequence','nonce','issuedAt','expiresAt','capabilityIds'];
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const CAPABILITY = /^[a-z][a-z0-9._:-]{2,99}$/;
const B64URL = /^[A-Za-z0-9_-]{22,90}$/;
const MAX_LIFETIME_MS = 120_000;
const MAX_CLOCK_SKEW_MS = 20_000;
const MAX_AGE_MS = 120_000;
const clean = s => typeof s === 'string' ? s : '';
const error = reason => Object.freeze({
  ok:false,reason,cryptographicEvidenceVerified:false,
  siteAiLiveStatusEligible:false,executionAuthorized:false,productionMutationAuthorized:false,
});

export function canonicalSiteAiHeartbeat(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_payload');
  const keys=Object.keys(input);
  if(keys.length!==FIELDS.length||keys.some(k=>!FIELDS.includes(k)))throw new Error('unexpected_or_missing_field');
  if(input.contract!==SITE_AI_HEARTBEAT_CONTRACT)throw new Error('wrong_contract');
  for(const k of ['siteId','workspaceId','agentId','keyId']){
    if(!ID.test(clean(input[k])))throw new Error('invalid_identity');
  }
  if(!Number.isSafeInteger(input.sequence)||input.sequence<1)throw new Error('invalid_sequence');
  if(!B64URL.test(clean(input.nonce)))throw new Error('invalid_nonce');
  const issued=Date.parse(input.issuedAt),expires=Date.parse(input.expiresAt);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)
     ||new Date(issued).toISOString()!==input.issuedAt
     ||new Date(expires).toISOString()!==input.expiresAt
     ||expires<=issued||expires-issued>MAX_LIFETIME_MS)throw new Error('invalid_timestamps');
  if(!Array.isArray(input.capabilityIds)||input.capabilityIds.length<1||input.capabilityIds.length>12
     ||input.capabilityIds.some(v=>!CAPABILITY.test(clean(v)))
     ||input.capabilityIds.some((v,i,a)=>i>0&&a[i-1]>=v))throw new Error('invalid_capabilities');
  const canonical=Object.fromEntries(FIELDS.map(field=>[field,input[field]]));
  return DOMAIN+JSON.stringify(canonical);
}
function decodeBase64Url(text) {
  if(typeof text!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(text))throw new Error('invalid_signature');
  const base64=text.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(base64+'=='),c=>c.charCodeAt(0));
}
export async function verifySiteAiHeartbeatCandidate(
  signed={},
  {registration,nowMs=Date.now(),previousSequence=null,noncePreviouslySeen=false,cryptoImpl=globalThis.crypto}={}
){
  let message;
  try {message=canonicalSiteAiHeartbeat(signed.payload)}
  catch(e){return error(String(e?.message||'invalid_payload').slice(0,80))}
  const p=signed.payload;
  if(!Number.isFinite(nowMs))return error('invalid_clock');
  const issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);
  if(issued>nowMs+MAX_CLOCK_SKEW_MS||issued<nowMs-MAX_AGE_MS||expires<=nowMs)return error('stale_or_future_heartbeat');
  if(!registration||registration.source!=='ekodi_authoritative_site_agent_registry'
     ||registration.active!==true||registration.revoked===true
     ||registration.workspaceMembershipVerified!==true
     ||registration.grantedByAuthorizedPersonVerified!==true
     ||registration.role!=='site_ai')return error('untrusted_registration');
  for(const k of ['siteId','workspaceId','agentId','keyId']){
    if(registration[k]!==p[k])return error('identity_scope_mismatch');
  }
  if(!Array.isArray(registration.capabilityIds)||
     p.capabilityIds.some(c=>!registration.capabilityIds.includes(c))||
     !registration.capabilityIds.includes('site-ai:heartbeat'))return error('capability_scope_mismatch');
  if(!Number.isFinite(Date.parse(registration.leaseExpiresAt))||Date.parse(registration.leaseExpiresAt)<=nowMs)
    return error('registration_lease_expired');
  if(previousSequence!==null&&(!Number.isSafeInteger(previousSequence)||p.sequence<=previousSequence))
    return error('replay_sequence');
  if(noncePreviouslySeen!==false)return error('replay_nonce_unverified');
  if(!(registration.publicKeyRaw instanceof Uint8Array)||registration.publicKeyRaw.byteLength!==32)
    return error('invalid_trust_anchor');
  let signature;
  try {signature=decodeBase64Url(signed.signature)}
  catch{return error('invalid_signature')}
  try{
    const key=await cryptoImpl.subtle.importKey('raw',registration.publicKeyRaw,{name:'Ed25519'},false,['verify']);
    const valid=await cryptoImpl.subtle.verify('Ed25519',key,signature,new TextEncoder().encode(message));
    if(!valid)return error('signature_mismatch');
  }catch{return error('cryptographic_verification_unavailable')}
  return Object.freeze({
    ok:true,reason:'signed_evidence_candidate',contract:SITE_AI_HEARTBEAT_CONTRACT,
    siteId:p.siteId,workspaceId:p.workspaceId,agentId:p.agentId,keyId:p.keyId,
    sequence:p.sequence,capabilityIds:Object.freeze([...p.capabilityIds]),
    cryptographicEvidenceVerified:true,
    // Only a *separate atomic, authority-owned commit* of sequence/nonce/lease can
    // establish a fresh live heartbeat. Never upgrade this result to agent online.
    atomicReplayCommitRequired:true,siteAiLiveStatusEligible:false,
    executionAuthorized:false,productionMutationAuthorized:false,
    automaticPaidApiBudgetKrw:0,
  });
}
