import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCampusAiIndependentOperations,CAMPUS_INDEPENDENCE_POLICY} from '../ekodibiz-campus-ai-independent-operations.js';

const NOW='2026-11-06T00:00:00.000Z';
function healthy(){
  return {observedAt:NOW,runtime:{local:{
    ledgerAvailable:true,tenantIsolationVerified:true,auditAvailable:true,
    taskQueueAvailable:true,financeReconciled:true,paymentCoreAvailable:true,backupRestoreVerified:true,nativeBrowserAvailable:true,
    recoveryPathAvailable:true,
  }},external:{aiSupplier:'online',governmentPortal:'online'},approvals:{
    universityContractVerified:true,individualConsentVerified:true,
    providerWrittenApprovalVerified:true,fscPgClassificationReviewed:true,
    bokForeignExchangeReviewed:true,taxAndInvoicesReviewed:true,
    universityFundsSettled:true,independentPaymentAuthorizationVerified:true,
  },termination:{unconfirmedCancellationCount:0,fourthChargeRiskCount:0}};
}
const inspect=(s)=>inspectCampusAiIndependentOperations(s,{now:NOW});
test('healthy synthetic observation is non-payment and sovereign-safe',()=>{
  const out=inspect(healthy());
  assert.equal(out.status,'SAFE_CORE_ONLY');assert.equal(out.coreAvailable,true);
  for(const key of ['moneyTransferred','subscriptionChanged','legalFilingSubmitted','paymentAuthorized','accountDeletionAuthorized','aiModelInvoked','externalBrowserInvoked'])
    assert.equal(out[key],false,key);
});
test('provider outage leaves first-party EKODI contract core available',()=>{
  const s=healthy();s.external.aiSupplier='offline';
  const out=inspect(s);assert.equal(out.status,'PROVIDER_DEGRADED_CORE_ONLY');
  assert.equal(out.coreAvailable,true);
  assert.ok(out.nextActions.some(x=>x.kind==='RECHECK_SUPPLIER_PUBLIC_STATUS'&&!x.requiresHuman&&!x.mayMutatePayment));
});
test('missing legal clearance blocks real money regardless of healthy provider',()=>{
  const s=healthy();s.approvals.fscPgClassificationReviewed=false;
  const out=inspect(s);assert.equal(out.status,'SAFE_REVIEW_ONLY');
  assert.ok(out.missingApprovalCodes.includes('fscPgClassificationReviewed'));
  assert.equal(out.paymentAuthorized,false);
  assert.ok(out.nextActions.some(x=>x.kind==='REVIEW_CONTRACT_AND_LEGAL_EVIDENCE'&&x.requiresHuman));
});
test('native browser outage does not trigger paid external fallback',()=>{
  const s=healthy();s.runtime.local.nativeBrowserAvailable=false;
  const out=inspect(s);assert.equal(out.coreAvailable,true);
  assert.equal(CAMPUS_INDEPENDENCE_POLICY.externalBrowserRequired,false);
  assert.equal(CAMPUS_INDEPENDENCE_POLICY.paidFallbackAuthorized,false);
  assert.ok(out.nextActions.some(x=>x.kind==='RECHECK_NATIVE_CHROMIUM'));
});
test('local tenant isolation or audit failure is a critical degraded state',()=>{
  const s=healthy();s.runtime.local.tenantIsolationVerified=false;s.runtime.local.auditAvailable=false;
  const out=inspect(s);assert.equal(out.status,'LOCAL_CONTROL_DEGRADED');
  assert.equal(out.coreAvailable,false);
});
test('stale or missing independent evidence cannot be claimed healthy',()=>{
  const s=healthy();s.observedAt='2026-11-05T23:40:00.000Z';
  const out=inspect(s);assert.equal(out.status,'OBSERVATION_UNKNOWN');
  assert.equal(out.coreAvailable,false);
  const missing=inspectCampusAiIndependentOperations({}, {now:NOW});
  assert.equal(missing.status,'OBSERVATION_UNKNOWN');
});
test('a detected fourth-charge risk cannot trigger any automatic cancellation',()=>{
  const s=healthy();s.termination.fourthChargeRiskCount=1;
  const out=inspect(s);assert.equal(out.status,'CANCELLATION_REVIEW_REQUIRED');
  assert.ok(out.nextActions.some(x=>x.kind==='OBTAIN_PROVIDER_CANCELLATION_PROOF'&&x.requiresHuman));
  assert.equal(out.subscriptionChanged,false);
});
test('unknown provider cancellation receipt is escalated instead of assumed successful',()=>{
  const s=healthy();delete s.termination.unconfirmedCancellationCount;
  const out=inspect(s);
  assert.ok(out.incidents.includes('TERMINATION_OBSERVATION_UNKNOWN'));
  assert.ok(out.nextActions.some(x=>x.kind==='VERIFY_TERMINATION_EVIDENCE'));
});
test('only safe read-only retry commands; all idempotency keys unique',()=>{
  const s=healthy();s.runtime.local.ledgerAvailable=false;
  s.external.aiSupplier='offline';s.external.governmentPortal='offline';
  const out=inspect(s);
  assert.equal(out.nextActions.length,new Set(out.nextActions.map(x=>x.idempotencyKey)).size);
  assert.ok(out.nextActions.every(x=>x.mayMutatePayment===false&&x.mayAuthenticateAsUser===false));
  assert.ok(out.nextActions.every(x=>x.requiresHuman?x.maxAttempts===0:x.maxAttempts<=2));
});
test('sensitive unknown fields are never projected to public operation reports',()=>{
  const s=healthy();s.runtime.credentials='sk-private-secret';
  s.privatePerson={email:'private@university.example',conversation:'private chat'};
  const out=inspect(s);
  assert.equal(JSON.stringify(out).includes('sk-private-secret'),false);
  assert.equal(JSON.stringify(out).includes('private@university.example'),false);
  assert.equal(JSON.stringify(out).includes('private chat'),false);
});
test('input strings may not forge healthy local status',()=>{
  const s=healthy();s.runtime.local.ledgerAvailable='true';
  const out=inspect(s);assert.equal(out.status,'LOCAL_CONTROL_DEGRADED');
});
test('future timestamps beyond clock skew are untrusted',()=>{
  const s=healthy();s.observedAt='2026-11-06T00:05:00.000Z';
  const out=inspect(s);assert.equal(out.observationsFresh,false);
});
test('all provider and legal states remain non-authoritative for live charge',()=>{
  const s=healthy();s.administrativeDecision='MAKE_PAYMENT_NOW';
  const out=inspect(s);assert.equal(out.paymentAuthorized,false);
  assert.equal(CAMPUS_INDEPENDENCE_POLICY.internalPaymentCore,'https://ekodi.kr/ekodipay');
});

test('payment core outage is visible while contracts retain separate local ledger',()=>{
  const value=healthy();value.runtime.local.paymentCoreAvailable=false;
  const out=inspect(value);
  assert.equal(out.coreAvailable,true);
  assert.equal(out.coreFullyHealthy,false);
  assert.equal(out.paymentAuthorized,false);
  assert.ok(out.checks.some(x=>x.code==='campus-payment_core'&&x.health==='FAIL'));
  assert.ok(out.nextActions.some(x=>x.kind==='RECHECK_FIRST_PARTY_HEALTH'));
});
test('missing verified restore drill cannot be marked fully healthy',()=>{
  const value=healthy();delete value.runtime.local.backupRestoreVerified;
  const out=inspect(value);
  assert.equal(out.coreFullyHealthy,false);
  assert.ok(out.checks.some(x=>x.code==='campus-backup_restore'&&x.health==='UNKNOWN'));
  assert.equal(out.productionOperationVerified,false);
});
