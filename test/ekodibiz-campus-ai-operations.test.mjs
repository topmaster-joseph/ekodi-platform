import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampusAiAgreement, registerCampusAiParticipant,
  previewCampusAiMonthlyCycle, planCampusAiTermination, reconcileCampusAiContract,
  CAMPUS_AI_PAYMENT_CORE } from '../ekodibiz-campus-ai-operations.js';

const agreement=()=>createCampusAiAgreement({
  agreementId:'uni-2026-pilot',universityWorkspaceId:'ws-university-100',
  providerCode:'openai',startDate:'2026-11-30',seatLimit:100,budgetMinor:10000000
});
const participant=(a=agreement())=>registerCampusAiParticipant(a,{
  subjectRef:'principal-random-001',consentEvidenceRef:'consent-receipt-001',
  membershipVerificationRef:'membership-receipt-001',ownedPersonalAccount:true,
  noPasswordCollected:true,noForcedWorkspaceMerge:true
});
const evidence=()=>({verifiedBy:'ekodi-core',agreementId:'uni-2026-pilot',
  universityWorkspaceId:'ws-university-100',subjectRef:'principal-random-001',
  coveredProvider:'openai',paymentPermission:true,auditReceiptRef:'audit-confirmed-001'});
const dossier=()=>({
  contract:{universitySigned:true,reference:'uni-2026-pilot',termMonths:3,startDate:'2026-11-30'},
  provider:{writtenThirdPartyPaymentApproval:true,approvalReference:'vendor-approval',supportedBillingIntegration:true,confirmedCancellationProcedure:true},
  individual:{accountOwnedByIndividual:true,informedConsentRecorded:true,noPasswordOrOtpCollection:true,noForcedWorkspaceMerge:true,endOfSponsorshipNoticeReady:true},
  law:{pgClassificationReviewed:true,foreignExchangeReviewed:true,taxAndInvoiceReviewed:true},
  funding:{universityPaymentSettled:true,currency:'KRW',authorizedCapMinor:10000000,plannedChargesMinor:20000},
  controls:{manualPaymentApproval:true,duplicateChargePrevention:true,auditTrailEnabled:true,terminationTrackingEnabled:true}
});

test('university agreement scoped to EKODIBIZ and existing EKODI pay core',()=>{
  const a=agreement(); assert.equal(a.ok,true);assert.equal(a.executionAllowed,false);
  assert.equal(a.ledgerScope.organizationId,'EKODIBIZ');assert.equal(a.paymentCore,CAMPUS_AI_PAYMENT_CORE);
  assert.deepEqual(a.schedule.installments,['2026-11-30','2026-12-30','2027-01-30']);
});
test('wrong payment core and impossible dates rejected',()=>{
  assert.equal(createCampusAiAgreement({...agreement(),paymentCore:'https://pay.example.com',providerCode:'openai',startDate:'2026-11-30'}).code,'PAYMENT_CORE_OVERRIDE_FORBIDDEN');
  assert.equal(createCampusAiAgreement({agreementId:'uni-2026-pilot',universityWorkspaceId:'ws-university-100',
    providerCode:'openai',startDate:'2026-02-30',seatLimit:1,budgetMinor:1000}).code,'START_DATE_INVALID');
});
test('participant requires consent and opaque account reference, never credentials',()=>{
  assert.equal(participant().ok,true);
  assert.equal(registerCampusAiParticipant(agreement(),{subjectRef:'student@example.com'}).ok,false);
});
test('unverified client approval cannot authorize payment',()=>{
  const r=previewCampusAiMonthlyCycle({agreement:agreement(),participant:participant(),cycleIndex:0,
    priceMinor:20000,trustedEvidence:{paymentPermission:true},preflightDossier:dossier()});
  assert.equal(r.code,'SERVER_VERIFIED_AUTHORITY_REQUIRED');
});
test('even clean evidence creates no payable intent',()=>{
  const r=previewCampusAiMonthlyCycle({agreement:agreement(),participant:participant(),cycleIndex:0,
    priceMinor:20000,trustedEvidence:evidence(),preflightDossier:dossier()});
  assert.equal(r.status,'QUOTE_FOR_APPROVAL');assert.equal(r.executionAllowed,false);
  assert.equal(r.gatewayCheckoutIntent,null);assert.equal(r.paymentCore,CAMPUS_AI_PAYMENT_CORE);
});
test('missing written vendor permission or PG review blocks',()=>{
  const d=dossier();d.provider.writtenThirdPartyPaymentApproval=false;d.law.pgClassificationReviewed=false;
  const r=previewCampusAiMonthlyCycle({agreement:agreement(),participant:participant(),
    cycleIndex:0,priceMinor:20000,trustedEvidence:evidence(),preflightDossier:d});
  assert.equal(r.code,'PREFLIGHT_BLOCKED');
});
test('cycle 4, duplicate and budget overrun blocked',()=>{
  const p={agreement:agreement(),participant:participant(),cycleIndex:1,
    priceMinor:20000,trustedEvidence:evidence(),preflightDossier:dossier()};
  assert.equal(previewCampusAiMonthlyCycle({...p,cycleIndex:3}).code,'OUTSIDE_THREE_MONTH_TERM');
  assert.equal(previewCampusAiMonthlyCycle({...p,completedCycleKeys:['uni-2026-pilot:principal-random-001:openai:1']}).code,'DUPLICATE_CYCLE');
  assert.equal(previewCampusAiMonthlyCycle({...p,spentMinor:9999999}).code,'UNIVERSITY_BUDGET_EXCEEDED');
});
test('tenant isolation blocks cross-university requests',()=>{
  const p={...participant(),universityWorkspaceId:'ws-other-campus'};
  assert.equal(previewCampusAiMonthlyCycle({agreement:agreement(),participant:p,cycleIndex:0,priceMinor:20000}).code,'TENANT_OR_AGREEMENT_SCOPE_MISMATCH');
});
test('termination records provider cancellation while retaining personal account',()=>{
  const a=planCampusAiTermination({agreement:agreement(),participant:participant(),chargeReceiptCycles:[0,1,2]});
  assert.equal(a.status,'CANCELLATION_CONFIRMATION_REQUIRED');assert.equal(a.personalAccountMustRemain,true);
  assert.equal(a.upcomingFourthChargeAllowed,false);
  const b=planCampusAiTermination({agreement:agreement(),participant:participant(),
    chargeReceiptCycles:[0,1,2],providerCancellationReceipt:'provider-cancel-001'});
  assert.equal(b.status,'CANCELLATION_RECORDED');
});
test('reconciliation is read-only and rejects out-of-balance amounts',()=>{
  const r=reconcileCampusAiContract({agreement:agreement(),universityReceivedMinor:300000,
    providerChargesMinor:250000,refundsMinor:10000});
  assert.equal(r.unallocatedMinor,40000);assert.equal(r.executionAllowed,false);
  assert.equal(reconcileCampusAiContract({agreement:agreement(),universityReceivedMinor:100,providerChargesMinor:200}).ok,false);
});
