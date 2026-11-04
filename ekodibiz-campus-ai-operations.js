/**
 * EKODIBIZ campus AI purchasing: pure NON-PAYMENT planning and verification.
 * Does not create a real payment intent, store passwords, call overseas
 * providers, issue invoices, or determine the regulatory classification.
 */
import { assessCampusAiPaymentPreflight, proposeThreeMonthBillingSchedule } from './ekodibiz-campus-ai-preflight.js';

export const CAMPUS_AI_PAYMENT_CORE='https://ekodi.kr/ekodipay';
const providers=new Set(['openai','anthropic','google']);
const id=x=>typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{3,95}$/.test(x);
const money=x=>Number.isSafeInteger(x)&&x>=0;
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const blocked=code=>Object.freeze({ok:false,status:'BLOCKED',code,executionAllowed:false});

export function createCampusAiAgreement(a={}){
  const {agreementId,universityWorkspaceId,providerCode,startDate,seatLimit,budgetMinor,currency='KRW',paymentCore=CAMPUS_AI_PAYMENT_CORE}=a;
  if(!id(agreementId)||!id(universityWorkspaceId))return blocked('AGREEMENT_OR_WORKSPACE_INVALID');
  if(!providers.has(providerCode))return blocked('PROVIDER_NOT_SUPPORTED');
  if(!validDate(startDate))return blocked('START_DATE_INVALID');
  if(!Number.isSafeInteger(seatLimit)||seatLimit<1||seatLimit>100000)return blocked('SEAT_LIMIT_INVALID');
  if(!money(budgetMinor)||budgetMinor===0)return blocked('BUDGET_INVALID');
  if(currency!=='KRW')return blocked('CURRENCY_REQUIRES_SEPARATE_REVIEW');
  if(paymentCore!==CAMPUS_AI_PAYMENT_CORE)return blocked('PAYMENT_CORE_OVERRIDE_FORBIDDEN');
  return Object.freeze({ok:true,status:'DRAFT',executionAllowed:false,agreementId,universityWorkspaceId,providerCode,seatLimit,budgetMinor,currency,paymentCore,
    ledgerScope:Object.freeze({organizationId:'EKODIBIZ',businessUnitId:'PAY',projectId:agreementId}),
    schedule:proposeThreeMonthBillingSchedule(startDate)});
}

export function registerCampusAiParticipant(agreement,input={}){
  if(agreement?.ok!==true)return blocked('AGREEMENT_INVALID');
  if(!id(input.subjectRef)||/@|https?:|\s/.test(input.subjectRef))return blocked('SUBJECT_REFERENCE_INVALID');
  if(!id(input.consentEvidenceRef)||!id(input.membershipVerificationRef))return blocked('CONSENT_OR_MEMBERSHIP_EVIDENCE_MISSING');
  if(input.ownedPersonalAccount!==true||input.noPasswordCollected!==true||input.noForcedWorkspaceMerge!==true)return blocked('PERSONAL_ACCOUNT_SAFETY_NOT_CONFIRMED');
  return Object.freeze({ok:true,status:'PENDING_AUTHORITY_VERIFICATION',executionAllowed:false,agreementId:agreement.agreementId,
    universityWorkspaceId:agreement.universityWorkspaceId,subjectRef:input.subjectRef,
    consentEvidenceRef:input.consentEvidenceRef,membershipVerificationRef:input.membershipVerificationRef});
}

/** trustedEvidence is strictly a SERVER-side corroboration, never client-supplied. */
export function previewCampusAiMonthlyCycle({agreement,participant,cycleIndex,priceMinor,spentMinor=0,reservedMinor=0,completedCycleKeys=[],trustedEvidence,preflightDossier}={}){
  if(agreement?.ok!==true||participant?.ok!==true||agreement.agreementId!==participant.agreementId||
    agreement.universityWorkspaceId!==participant.universityWorkspaceId)return blocked('TENANT_OR_AGREEMENT_SCOPE_MISMATCH');
  if(!Number.isInteger(cycleIndex)||cycleIndex<0||cycleIndex>2)return blocked('OUTSIDE_THREE_MONTH_TERM');
  if(!money(priceMinor)||priceMinor===0||!money(spentMinor)||!money(reservedMinor))return blocked('INVALID_AMOUNT');
  if(!Array.isArray(completedCycleKeys)||completedCycleKeys.some(x=>typeof x!=='string'))return blocked('CYCLE_RECEIPTS_INVALID');
  const cycleKey=[agreement.agreementId,participant.subjectRef,agreement.providerCode,cycleIndex].join(':');
  if(completedCycleKeys.includes(cycleKey))return blocked('DUPLICATE_CYCLE');
  const sum=spentMinor+reservedMinor+priceMinor;
  if(!Number.isSafeInteger(sum)||sum>agreement.budgetMinor)return blocked('UNIVERSITY_BUDGET_EXCEEDED');
  if(trustedEvidence?.verifiedBy!=='ekodi-core'||trustedEvidence.agreementId!==agreement.agreementId||
    trustedEvidence.universityWorkspaceId!==agreement.universityWorkspaceId||
    trustedEvidence.subjectRef!==participant.subjectRef||
    trustedEvidence.coveredProvider!==agreement.providerCode||
    trustedEvidence.paymentPermission!==true||!id(trustedEvidence.auditReceiptRef))
    return blocked('SERVER_VERIFIED_AUTHORITY_REQUIRED');
  const preflight=assessCampusAiPaymentPreflight(preflightDossier);
  if(preflight.status!=='REVIEW_REQUIRED'||preflight.blockers.length)
    return Object.freeze({ok:false,status:'BLOCKED',executionAllowed:false,code:'PREFLIGHT_BLOCKED',blockers:preflight.blockers});
  return Object.freeze({ok:true,status:'QUOTE_FOR_APPROVAL',executionAllowed:false,gatewayCheckoutIntent:null,
    paymentCore:agreement.paymentCore,agreementId:agreement.agreementId,subjectRef:participant.subjectRef,
    cycleIndex,cycleKey,dueDate:agreement.schedule.installments[cycleIndex],priceMinor,currency:agreement.currency,
    remainingBudgetMinor:agreement.budgetMinor-sum});
}

export function planCampusAiTermination({agreement,participant,chargeReceiptCycles=[],providerCancellationReceipt=null}={}){
  if(agreement?.ok!==true||participant?.ok!==true||agreement.agreementId!==participant.agreementId)return blocked('AGREEMENT_OR_PERSON_INVALID');
  if(!Array.isArray(chargeReceiptCycles)||chargeReceiptCycles.some(x=>!Number.isInteger(x)||x<0||x>2)||new Set(chargeReceiptCycles).size!==chargeReceiptCycles.length)
    return blocked('INVALID_CHARGE_RECEIPTS');
  const confirmed=typeof providerCancellationReceipt==='string'&&id(providerCancellationReceipt);
  return Object.freeze({ok:true,status:confirmed?'CANCELLATION_RECORDED':'CANCELLATION_CONFIRMATION_REQUIRED',
    executionAllowed:false,personalAccountMustRemain:true,accountDeletionRequired:false,
    upcomingFourthChargeAllowed:false,nextCycleWouldStart:agreement.schedule.nextCycleWouldStart,
    cancellationReceipt:confirmed?providerCancellationReceipt:null,completedPaidCycles:chargeReceiptCycles.length});
}

export function reconcileCampusAiContract({agreement,universityReceivedMinor,providerChargesMinor,refundsMinor=0}={}){
  if(agreement?.ok!==true||!money(universityReceivedMinor)||!money(providerChargesMinor)||!money(refundsMinor))return blocked('ACCOUNTING_DATA_INVALID');
  if(providerChargesMinor>agreement.budgetMinor||providerChargesMinor+refundsMinor>universityReceivedMinor)return blocked('AMOUNT_RECONCILIATION_MISMATCH');
  return Object.freeze({ok:true,status:'REVIEW_REQUIRED',executionAllowed:false,organizationId:'EKODIBIZ',agreementId:agreement.agreementId,
    universityReceivedMinor,providerChargesMinor,refundsMinor,
    unallocatedMinor:universityReceivedMinor-providerChargesMinor-refundsMinor,
    caveat:'Not a bank settlement, tax invoice, payment or regulatory approval.'});
}
