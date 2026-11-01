// EKODI Invest: pure, side-effect-free broker read-only boundary.
// This module NEVER fetches broker APIs, signs requests, or accepts credentials.
// The account/token vault and KIS query construction require a separate protected release.
const OWNER='topmaster.joseph@gmail.com';
const KIS_OPERATIONS=Object.freeze({
 holdings:'/uapi/domestic-stock/v1/trading/inquire-balance',
 orderHistory:'/uapi/domestic-stock/v1/trading/inquire-daily-ccld'
});
const TOSS_OPERATIONS=Object.freeze({
 accounts:'/api/v1/accounts',
 holdings:'/api/v1/holdings',
 orderHistory:'/api/v1/orders',
 quotes:'/api/v1/prices'
});
const FREEZE_MODE=(origin,operations)=>Object.freeze({origin,operations});
export const READONLY_BROKER_TARGETS=Object.freeze({
 kis:Object.freeze({
  paper:FREEZE_MODE('https://openapivts.koreainvestment.com:29443',KIS_OPERATIONS),
  live:FREEZE_MODE('https://openapi.koreainvestment.com:9443',KIS_OPERATIONS)
 }),
 toss:Object.freeze({
  live:FREEZE_MODE('https://openapi.tossinvest.com',TOSS_OPERATIONS)
 }),
 ibkr:Object.freeze({})
});
const reject=(reason)=>Object.freeze({allowed:false,reason,networkCallPerformed:false});
const token=s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(s);
export function resolveBrokerReadOnlyTarget(input={}){
 const brokerId=input.brokerId;
 const environment=input.environment;
 const operation=input.operation;
 if(!token(brokerId)||!Object.hasOwn(READONLY_BROKER_TARGETS,brokerId))return reject('BROKER_UNREGISTERED');
 if(!token(environment)||!Object.hasOwn(READONLY_BROKER_TARGETS[brokerId],environment))return reject('BROKER_ENVIRONMENT_UNAVAILABLE');
 const mode=READONLY_BROKER_TARGETS[brokerId][environment];
 if(!token(operation)||!Object.hasOwn(mode.operations,operation))return reject('BROKER_OPERATION_NOT_READONLY');
 if(input.method!==undefined&&input.method!=='GET')return reject('BROKER_NON_GET_FORBIDDEN');
 // The boundary does not consume any client-chosen URL/path/query or headers.
 if(input.url!==undefined||input.path!==undefined||input.query!==undefined||
    input.headers!==undefined||input.body!==undefined||input.credential!==undefined||
    input.accessToken!==undefined||input.appSecret!==undefined)return reject('BROKER_UNTRUSTED_REQUEST_MATERIAL');
 const pathname=mode.operations[operation];
 return Object.freeze({
  allowed:true,brokerId,environment,operation,method:'GET',
  origin:mode.origin,pathname,canonicalUrl:mode.origin+pathname,
  accountData:['accounts','holdings','orderHistory'].includes(operation),
  credentialsIncluded:false,connected:false,readOnlyConnectionVerified:false,
  networkCallPerformed:false,executionPerformed:false
 });
}
export function evaluateBrokerReadOnlyPrerequisites(input={}){
 const brokerId=input.brokerId,environment=input.environment;
 const target=resolveBrokerReadOnlyTarget({brokerId,environment,operation:'holdings'});
 const blockers=[];
 if(!target.allowed)blockers.push(target.reason);
 if(String(input.ownerEmail||'').trim().toLowerCase()!==OWNER)blockers.push('NAMED_OWNER_REQUIRED');
 if(input.verifiedIdentity!==true)blockers.push('SERVER_IDENTITY_REQUIRED');
 if(input.strongMfaAal2!==true)blockers.push('STRONG_MFA_AAL2_REQUIRED');
 if(input.ownerStepUp!==true)blockers.push('OWNER_STEP_UP_REQUIRED');
 if(input.ownAccountEvidence!==true)blockers.push('OWN_ACCOUNT_EVIDENCE_REQUIRED');
 if(input.providerReadPermissionVerified!==true)blockers.push('OFFICIAL_READ_SCOPE_REQUIRED');
 if(input.ownerConsentVerified!==true)blockers.push('OWNER_API_CONSENT_REQUIRED');
 if(input.serverVaultCredentialVerified!==true)blockers.push('VAULT_CREDENTIAL_REQUIRED');
 if(input.approvedEgressVerified!==true)blockers.push('APPROVED_EGRESS_REQUIRED');
 return Object.freeze({
  schema:'ekodi.invest.broker-readonly-preflight.v1',
  brokerId:token(brokerId)?brokerId:null,
  environment:token(environment)?environment:null,
  eligibleForSeparateReadOnlyIntegration:blockers.length===0,
  blockers:Object.freeze(blockers),
  connected:false,readOnlyConnectionVerified:false,
  credentialsIncluded:false,networkCallPerformed:false,executionPerformed:false,
  liveOrdersEnabled:false
 });
}
export function checkBrokerReadOnlyRequest(input={}){
 const target=resolveBrokerReadOnlyTarget(input);
 if(!target.allowed)return target;
 // Exact canonical destination; never accept arbitrary protocol/host/query/fragment.
 if(input.requestedUrl!==target.canonicalUrl)return reject('BROKER_DESTINATION_MISMATCH');
 return Object.freeze({...target,requestApprovedForSeparateServerImplementation:true});
}
