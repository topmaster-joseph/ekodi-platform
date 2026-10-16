import test from 'node:test';
import assert from 'node:assert/strict';
import {
 validMerchantProfile,indexMerchantProfiles,merchantReadiness,selectServerApprovedMerchant,
 verifyProviderOwnership,publicMerchantSummary
} from '../ekodipay-merchant-contract.js';
import {reconcileMerchantSettlements,settlementQueryPlan} from '../ekodipay-settlement-reconciliation.js';
const proof=(n)=>({status:'verified',proofRef:'PROOF_'+n.toUpperCase()+'_001',approvedAt:1790000000000});
const fixture=(id='ekodibiz',mid='merchantA',service='ekodibiz')=>({
 merchantId:id,legalEntityRef:'entity_'+id,state:'verified',provider:'tosspayments',
 services:[service],issuerRefs:{[service]:'issuer_'+id},
 midByMode:{test:'test'+mid,live:'live'+mid},
 credentialRefs:{test:{client:'PAY_'+id.toUpperCase()+'_TEST_CLIENT',secret:'PAY_'+id.toUpperCase()+'_TEST_SECRET'},
   live:{client:'PAY_'+id.toUpperCase()+'_LIVE_CLIENT',secret:'PAY_'+id.toUpperCase()+'_LIVE_SECRET'}},
 settlement:{bankCode:'088',accountLast4:'1234',fingerprint:(id==='ekodibiz'?'a':'b').repeat(64),proofRef:'BANK_PROOF_0001'},
 evidence:{
  business_identity:proof('business'),pg_contract:proof('contract'),pg_mid:proof('mid'),
  settlement_account_owner:proof('bank'),order_issuer:proof('issuer'),
  refund_policy:proof('refund'),settlement_reconciliation:proof('reconcile'),
  financial_owner:proof('owner')
 }
});
const approved=(p)=>({source:'trusted_order_issuer',approved:true,orderId:'EB-ORDER000000001',
 merchantId:p.merchantId,service:p.services[0],issuerRef:p.issuerRefs[p.services[0]],
 amount:50000,currency:'KRW',issuerProofRef:'ISSUERPROOF_001',
 approvedAt:Date.now()-1_000,expiresAt:Date.now()+15*60*1_000});
const envFor=p=>Object.fromEntries([
 [p.credentialRefs.test.client,'test_gck_mock'],
 [p.credentialRefs.test.secret,'test_gsk_mock'],
 [p.credentialRefs.live.client,'live_gck_mock'],
 [p.credentialRefs.live.secret,'live_gsk_mock']
]);
test('merchant registry detects globally duplicated MID, secrets and tenant IDs',()=>{
 const a=fixture(),b=fixture('ekodiedu','merchantB','ekodiedu');
 assert.equal(validMerchantProfile(a),true);
 assert.equal(indexMerchantProfiles([a,b]).merchants.size,2);
 assert.throws(()=>indexMerchantProfiles([a,{...b,settlement:{...b.settlement,fingerprint:a.settlement.fingerprint}}]),/cross_merchant_settlement_account_collision/);
 const pending={...b,state:'pending',settlement:null,midByMode:{test:'',live:''},
   credentialRefs:{test:{client:'',secret:''},live:{client:'',secret:''}},issuerRefs:{}};
 assert.equal(validMerchantProfile(pending),true);
 assert.equal(indexMerchantProfiles([a,pending]).merchants.size,2);
 assert.equal(merchantReadiness(pending,{mode:'test'}).ready,false);
 assert.throws(()=>indexMerchantProfiles([a,a]),/duplicate_merchant/);
 assert.throws(()=>indexMerchantProfiles([a,{...b,midByMode:{test:a.midByMode.test,live:b.midByMode.live}}]),/mid_collision/);
 assert.throws(()=>indexMerchantProfiles([a,{...b,credentialRefs:{...b.credentialRefs,test:{client:a.credentialRefs.test.client,secret:b.credentialRefs.test.secret}}}]),/credential_collision/);
 assert.equal(validMerchantProfile({...a,settlement:{...a.settlement,accountNumber:'0123456'}}),false);
 assert.throws(()=>indexMerchantProfiles([{...a,settlement:{...a.settlement,accountLast4:'123'}}]),/invalid_private_merchant_profile/);
});
test('merchant route is server-approved and issuer+service+tenant pinned; never picks a global fallback',()=>{
 const a=fixture(),b=fixture('ekodiedu','merchantB','ekodiedu'),ix=indexMerchantProfiles([a,b]);
 let chosen=selectServerApprovedMerchant(ix,approved(a),{mode:'test',env:envFor(a)});
 assert.equal(chosen.ok,true);
 assert.equal(chosen.privateContext.mid,a.midByMode.test);
 const paid={mId:a.midByMode.test,currency:'KRW',orderId:'EB-ORDER000000001',
    totalAmount:50000,status:'DONE',method:'카드',paymentKey:'payment_ABCDEFG'};
 assert.equal(verifyProviderOwnership(chosen,paid),true);
 assert.equal(verifyProviderOwnership(chosen,{...paid,mId:b.midByMode.test}),false);
 assert.equal(verifyProviderOwnership(chosen,{...paid,orderId:'EB-ATTACK000000000'}),false);
 assert.equal(verifyProviderOwnership(chosen,{...paid,totalAmount:1}),false);
 assert.equal(verifyProviderOwnership(chosen,{...paid,status:'WAITING_FOR_DEPOSIT'}),false);
 assert.equal(verifyProviderOwnership(chosen,{...paid,method:'가상계좌'}),false);
 assert.equal(selectServerApprovedMerchant(ix,{...approved(a),merchantId:'ekodiedu'},{mode:'test',env:envFor(a)}).ok,false);
 assert.equal(selectServerApprovedMerchant(ix,{...approved(a),issuerRef:'issuer_attacker'},{mode:'test',env:envFor(a)}).ok,false);
 assert.equal(selectServerApprovedMerchant(ix,{...approved(a),source:'http_browser'},{mode:'test',env:envFor(a)}).ok,false);
 assert.equal(selectServerApprovedMerchant(ix,{...approved(a),approved:false},{mode:'test',env:envFor(a)}).ok,false);
 assert.equal(selectServerApprovedMerchant(ix,approved(a),{mode:'test',env:envFor(b)}).ok,false);
 assert.equal(JSON.stringify(publicMerchantSummary(a)).includes('merchantA'),false);
 assert.equal(JSON.stringify(publicMerchantSummary(a)).includes('1234'),false);
 assert.equal(JSON.stringify(publicMerchantSummary(a)).includes('aaaaa'),false);
});
test('private merchant resolver rejects implicit environment, expired/forged issuer evidence and oversized order identifiers',()=>{
 const a=fixture(),ix=indexMerchantProfiles([a]),order=approved(a),env=envFor(a);
 assert.deepEqual(selectServerApprovedMerchant(ix,order,{env}),{ok:false,reason:'explicit_payment_mode_required'});
 const invalid=[
  {...order,expiresAt:Date.now()-1},
  {...order,issuerProofRef:'client'},
  {...order,approvedAt:Date.now()+60_000},
  {...order,orderId:'X'.repeat(65)},
  {...order,amount:10_000_000_001},
  {...order,amount:1},
 ];
 for(const o of invalid){const x=selectServerApprovedMerchant(ix,o,{mode:'test',env});assert.equal(x.ok,false);}
 assert.equal(selectServerApprovedMerchant(ix,order,{mode:'test',env}).ok,true);
});
test('live merchant readiness requires independent evidence and owner gate, not a private key prefix alone',()=>{
 const a=fixture(),ix=indexMerchantProfiles([a]);
 assert.equal(merchantReadiness(a,{mode:'live'}).ready,false);
 assert.equal(merchantReadiness(a,{mode:'live',ownerGate:'APPROVED'}).ready,true);
 assert.equal(merchantReadiness({...a,evidence:{...a.evidence,pg_contract:{status:'pending'}}},{mode:'live',ownerGate:'APPROVED'}).ready,false);
 assert.equal(merchantReadiness({...a,state:'suspended'},{mode:'test'}).ready,false);
 const res=selectServerApprovedMerchant(ix,approved(a),{mode:'live',ownerGate:'DISABLED',env:envFor(a)});
 assert.equal(res.ok,false);
 assert.equal(selectServerApprovedMerchant(ix,approved(a),{mode:'live',ownerGate:'APPROVED',env:envFor(a)}).ok,true);
});
const local=(merchantId='ekodibiz',mid='merchantA')=>({
 merchantId,pgMode:'live',mId:mid,status:'DONE',transactionKey:'transaction001',
 paymentKey:'payment001',orderId:'order001',amount:50000,expectedPayoutAmount:48350
});
const pg=(mid='merchantA')=>({mId:mid,transactionKey:'transaction001',paymentKey:'payment001',
 orderId:'order001',amount:50000,payOutAmount:48350,currency:'KRW',fees:[{type:'BASE',fee:1500}]});
const reconcile=(loc=[local()],prov=[pg()],options={})=>
 reconcileMerchantSettlements({merchantId:'ekodibiz',mid:'merchantA',mode:'live',
 localTransactions:loc,pgSettlements:prov,sourceVerified:true,paginationComplete:true,...options});
test('PG settlement match never implies actual bank credit',()=>{
 const m=reconcile();
 assert.equal(m.pgReconciled,true);assert.equal(m.bankDepositVerified,false);
 assert.equal(m.disposition,'bank_deposit_pending');assert.equal(m.totals.localPayout,48350);
 const fingerprint='a'.repeat(64);
 assert.equal(reconcile([local()],[pg()],{bankCreditVerified:true}).disposition,'bank_deposit_pending');
 assert.equal(reconcile([local()],[pg()],{expectedAccountFingerprint:fingerprint,
   bankEvidence:{source:'authenticated_bank_statement',verified:true,creditDirection:'CREDIT',statementTransactionRef:'BANKTX_000001',merchantId:'ekodibiz',
     accountFingerprint:fingerprint,currency:'KRW',amount:48350,
     proofRef:'BANK_CREDIT_001',verifiedAt:1790000000000}}).disposition,'bank_verified');
 assert.equal(reconcile([local()],[pg()],{expectedAccountFingerprint:fingerprint,
   bankEvidence:{source:'authenticated_bank_statement',verified:true,creditDirection:'CREDIT',statementTransactionRef:'BANKTX_000002',merchantId:'ekodiedu',
     accountFingerprint:fingerprint,currency:'KRW',amount:48350,
     proofRef:'BANK_CREDIT_001',verifiedAt:1790000000000}}).bankDepositVerified,false);
});
test('empty PG day cannot be promoted to verified bank deposit even with an attested zero amount',()=>{
 const fingerprint='a'.repeat(64);
 const v=reconcile([],[],{expectedAccountFingerprint:fingerprint,bankEvidence:{
  source:'authenticated_bank_statement',verified:true,merchantId:'ekodibiz',
  creditDirection:'CREDIT',statementTransactionRef:'BANKTX_EMPTY01',
  accountFingerprint:fingerprint,currency:'KRW',amount:0,
  proofRef:'BANK_CREDIT_001',verifiedAt:1790000000000}});
 assert.equal(v.pgReconciled,true);
 assert.equal(v.bankDepositVerified,false);
 assert.equal(v.disposition,'bank_deposit_pending');
});
test('bank credit must have authenticated direction and unique statement transaction reference',()=>{
 const fp='a'.repeat(64),common={source:'authenticated_bank_statement',verified:true,
  merchantId:'ekodibiz',accountFingerprint:fp,currency:'KRW',amount:48350,
  proofRef:'BANK_CREDIT_001',verifiedAt:1790000000000};
 for(const attestation of [
  {...common,statementTransactionRef:'BANKTX_000001'},
  {...common,creditDirection:'DEBIT',statementTransactionRef:'BANKTX_000001'},
  {...common,creditDirection:'CREDIT',statementTransactionRef:'short'},
 ]){
  assert.equal(reconcile([local()],[pg()],{expectedAccountFingerprint:fp,bankEvidence:attestation}).bankDepositVerified,false);
 }
});
test('settlement is fail-closed for MID, key, amount, payout, duplicate, missing, foreign or untrusted PG data',()=>{
 const faults=[
  reconcile([local()],[pg('merchantB')]),
  reconcile([local()],[{...pg(),amount:1}]),
  reconcile([local()],[{...pg(),payOutAmount:100}]),
  reconcile([local()],[{...pg(),paymentKey:'payment002'}]),
  reconcile([local()],[]),
  reconcile([local()],[pg(),pg()]),
  reconcile([],[pg()]),
  reconcile([local('ekodiedu')],[pg()]),
  reconcile([local()],[pg()],{paginationComplete:false}),
  reconcile([local()],[pg()],{sourceVerified:false})
 ];
 for(const value of faults){assert.equal(value.pgReconciled,false);assert.equal(value.bankDepositVerified,false);assert.equal(value.disposition,'requires_review');}
});
test('PG settlement query limits and soldDate vs paidOutDate are explicit',()=>{
 assert.match(settlementQueryPlan({startDate:'2026-10-01',endDate:'2026-10-16'}),/^\/v1\/settlements\?/);
 assert.match(settlementQueryPlan({startDate:'2026-10-01',endDate:'2026-10-16',dateType:'paidOutDate'}),/paidOutDate/);
 assert.throws(()=>settlementQueryPlan({startDate:'2026-10-20',endDate:'2026-10-16'}),/invalid_settlement_query/);
 assert.throws(()=>settlementQueryPlan({startDate:'2026-10-01',endDate:'2026-10-16',size:5001}),/invalid_settlement_query/);
});
