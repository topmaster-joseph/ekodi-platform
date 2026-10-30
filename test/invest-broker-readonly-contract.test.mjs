import test from 'node:test';
import assert from 'node:assert/strict';
import {
 READONLY_BROKER_TARGETS,resolveBrokerReadOnlyTarget,
 evaluateBrokerReadOnlyPrerequisites,checkBrokerReadOnlyRequest
} from '../invest-broker-readonly-contract.js';

test('official KIS paper and live REST targets are distinct and GET-only',()=>{
 const live=resolveBrokerReadOnlyTarget({brokerId:'kis',environment:'live',operation:'holdings'});
 const paper=resolveBrokerReadOnlyTarget({brokerId:'kis',environment:'paper',operation:'holdings'});
 assert.equal(paper.allowed,true);
 assert.equal(paper.canonicalUrl,'https://openapivts.koreainvestment.com:29443/uapi/domestic-stock/v1/trading/inquire-balance');
 assert.equal(live.canonicalUrl,'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/trading/inquire-balance');
 assert.equal(live.method,'GET');
 assert.equal(paper.executionPerformed,false);
 assert.equal(live.networkCallPerformed,false);
 assert.notEqual(live.origin,paper.origin);
 assert.equal(Object.isFrozen(READONLY_BROKER_TARGETS.kis.paper),true);
});
test('toss read-only account endpoints do not expose order submission',()=>{
 const a=resolveBrokerReadOnlyTarget({brokerId:'toss',environment:'live',operation:'accounts'});
 const h=resolveBrokerReadOnlyTarget({brokerId:'toss',environment:'live',operation:'holdings'});
 assert.equal(a.canonicalUrl,'https://openapi.tossinvest.com/api/v1/accounts');
 assert.equal(h.canonicalUrl,'https://openapi.tossinvest.com/api/v1/holdings');
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'toss',environment:'paper',operation:'holdings'}).allowed,false);
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'toss',environment:'live',operation:'orderCreate'}).allowed,false);
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'toss',environment:'live',operation:'holdings',method:'POST'}).allowed,false);
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'kis',environment:'live',operation:'orderHistory',method:'DELETE'}).allowed,false);
});
test('untrusted hosts, query, body, credentials, unknown broker and IBKR are blocked',()=>{
 const base={brokerId:'kis',environment:'paper',operation:'holdings'};
 for(const variant of [
  {url:'https://evil.example'}, {path:'/uapi/domestic-stock/v1/trading/order-cash'},
  {query:{CANO:'12345678'}}, {headers:{Authorization:'secret'}},
  {body:{side:'BUY'}},{credential:'secret'},{accessToken:'secret'},{appSecret:'secret'},
  {method:'GET?bad=1'}
 ]){
  const result=resolveBrokerReadOnlyTarget({...base,...variant});
  assert.equal(result.allowed,false,JSON.stringify(variant));
  assert.equal(JSON.stringify(result).includes('secret'),false);
 }
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'ibkr',environment:'live',operation:'holdings'}).allowed,false);
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'__proto__',environment:'live',operation:'holdings'}).allowed,false);
 assert.equal(resolveBrokerReadOnlyTarget({brokerId:'kis',environment:'live',operation:'orders'}).allowed,false);
 const ok=checkBrokerReadOnlyRequest({...base,requestedUrl:'https://openapivts.koreainvestment.com:29443/uapi/domestic-stock/v1/trading/inquire-balance'});
 const unsafe=checkBrokerReadOnlyRequest({...base,requestedUrl:'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/trading/inquire-balance'});
 const query=checkBrokerReadOnlyRequest({...base,requestedUrl:'https://openapivts.koreainvestment.com:29443/uapi/domestic-stock/v1/trading/inquire-balance?CANO=1234'});
 assert.equal(ok.requestApprovedForSeparateServerImplementation,true);
 assert.equal(ok.networkCallPerformed,false);
 assert.equal(unsafe.allowed,false);
 assert.equal(query.allowed,false);
});
test('preflight never treats missing owner, provider permissions or AAL2 as a live connection',()=>{
 const base={
  brokerId:'kis',environment:'paper',ownerEmail:'topmaster.joseph@gmail.com',
  verifiedIdentity:true,strongMfaAal2:true,ownerStepUp:true,
  ownAccountEvidence:true,providerReadPermissionVerified:true,
  ownerConsentVerified:true,serverVaultCredentialVerified:true,approvedEgressVerified:true
 };
 const initial=evaluateBrokerReadOnlyPrerequisites({brokerId:'kis',environment:'paper'});
 assert.equal(initial.eligibleForSeparateReadOnlyIntegration,false);
 assert.ok(initial.blockers.includes('NAMED_OWNER_REQUIRED'));
 assert.ok(initial.blockers.includes('STRONG_MFA_AAL2_REQUIRED'));
 assert.ok(initial.blockers.includes('VAULT_CREDENTIAL_REQUIRED'));
 for(const key of ['ownerEmail','verifiedIdentity','strongMfaAal2','ownerStepUp','ownAccountEvidence',
    'providerReadPermissionVerified','ownerConsentVerified','serverVaultCredentialVerified','approvedEgressVerified']){
  const patch=key==='ownerEmail'?'other@example.com':false;
  const blocked=evaluateBrokerReadOnlyPrerequisites({...base,[key]:patch});
  assert.equal(blocked.eligibleForSeparateReadOnlyIntegration,false,key);
 }
 const preflight=evaluateBrokerReadOnlyPrerequisites(base);
 assert.equal(preflight.eligibleForSeparateReadOnlyIntegration,true);
 assert.equal(preflight.connected,false);
 assert.equal(preflight.readOnlyConnectionVerified,false);
 assert.equal(preflight.liveOrdersEnabled,false);
 assert.equal(preflight.networkCallPerformed,false);
 assert.equal(preflight.executionPerformed,false);
 assert.equal(preflight.credentialsIncluded,false);
});
