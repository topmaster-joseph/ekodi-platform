/**
 * EKODI campus AI service-independent operations supervisor.
 * Read-only, provider-neutral and side-effect free. It reuses the shared
 * EKODI autonomous reconciler; it never performs a charge or legal filing.
 */
import { reconcileDesiredState } from './ekodi-autonomic-reconciler.js';

export const CAMPUS_INDEPENDENCE_POLICY = Object.freeze({
  id:'EKODIBIZ-CAMPUS-AI-INDEPENDENCE-001',
  owner:'ekodi-orchestrator',
  organization:'EKODIBIZ',
  externalBrowserRequired:false,
  aiModelRequired:false,
  onlineProviderRequiredForCore:false,
  paymentExecutionAuthorized:false,
  legalSubmissionAuthorized:false,
  accountDeletionAuthorized:false,
  paidFallbackAuthorized:false,
  internalPaymentCore:'https://ekodi.kr/ekodipay',
});

const CHECKS = Object.freeze([
  ['ledger','local.ledgerAvailable','critical'],
  ['tenant_isolation','local.tenantIsolationVerified','critical'],
  ['audit','local.auditAvailable','critical'],
  ['queue','local.taskQueueAvailable','important'],
  ['finance_reconciliation','local.financeReconciled','important'],
  ['native_browser','local.nativeBrowserAvailable','supplementary'],
  ['recovery_path','local.recoveryPathAvailable','important'],
]);
const APPROVALS = Object.freeze([
  'universityContractVerified','individualConsentVerified',
  'providerWrittenApprovalVerified','fscPgClassificationReviewed',
  'bokForeignExchangeReviewed','taxAndInvoicesReviewed',
  'universityFundsSettled','independentPaymentAuthorizationVerified',
]);
const recRules = Object.freeze(CHECKS.map(([id,selector,severity])=>Object.freeze({
  id:'campus-'+id, entityId:'EKODIBIZ', scope:'campus-ai',
  selector, expected:true, operator:'equals', severity,
  changeClass:'green', autoRepairPolicy:'observe-only',
  source:'ekodi-core', description:'Locally verified runtime requirement',
})));
const safeCount=value=>Number.isSafeInteger(value) && value>=0 && value<=1000000 ? value : null;
const safeDate=value=>{
  if(typeof value!=='string'||value.length>40)return null;
  const millis=Date.parse(value);
  return Number.isFinite(millis)?millis:null;
};
const healthCode = item=>item.status==='compliant'?'PASS':item.status==='unknown'?'UNKNOWN':'FAIL';
const makeTask=(kind,key,requiresHuman)=>Object.freeze({
  idempotencyKey:'campus-ai:'+key,kind,
  class:requiresHuman?'human_gate':'read_only_recheck',
  requiresHuman, mayMutatePayment:false, mayAuthenticateAsUser:false,
  maxAttempts:requiresHuman?0:2,
});

export function inspectCampusAiIndependentOperations(input={}, options={}){
  const snapshot=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const time=safeDate(options.now||new Date().toISOString());
  if(time===null)throw new TypeError('NOW_INVALID');
  const receivedAt=safeDate(snapshot.observedAt);
  const fresh=receivedAt!==null && receivedAt<=time+60000 && time-receivedAt<=15*60*1000;
  const observed=snapshot.runtime&&typeof snapshot.runtime==='object'?snapshot.runtime:{};
  const prev=options.previousRuntime&&typeof options.previousRuntime==='object'?options.previousRuntime:null;
  const recon=reconcileDesiredState({registryId:'EKODIBIZ-CAMPUS-INDEPENDENCE',rules:recRules},observed,
    {now:new Date(time).toISOString(),previousObserved:prev});
  const checks=Object.freeze(recon.results.map(r=>Object.freeze({code:r.ruleId,health:fresh?healthCode(r):'UNKNOWN',
    severity:recRules.find(x=>x.id===r.ruleId)?.severity||'important'})));
  const criticalFault=checks.some(x=>x.severity==='critical'&&x.health!=='PASS');
  const localFault=checks.some(x=>x.health!=='PASS');
  const coreReady=fresh&&!criticalFault&&!localFault;
  const canUseCore=fresh&&!criticalFault;
  const external=snapshot.external&&typeof snapshot.external==='object'?snapshot.external:{};
  const providerHealth=['online','offline'].includes(external.aiSupplier)?external.aiSupplier:'unknown';
  const stateOfBrowser=['online','offline'].includes(external.governmentPortal)?external.governmentPortal:'unknown';
  const authorizations=snapshot.approvals&&typeof snapshot.approvals==='object'?snapshot.approvals:{};
  const missingApprovals=Object.freeze(APPROVALS.filter(key=>authorizations[key]!==true));
  const termination=snapshot.termination&&typeof snapshot.termination==='object'?snapshot.termination:{};
  const unconfirmedCancellations=safeCount(termination.unconfirmedCancellationCount);
  const potentialFourthCharges=safeCount(termination.fourthChargeRiskCount);
  const incidents=[];
  const tasks=[];
  if(!fresh){
    incidents.push('STALE_OR_MISSING_CORE_EVIDENCE');
    tasks.push(makeTask('RECHECK_FIRST_PARTY_HEALTH','freshness',false));
  }
  for(const check of checks){
    if(check.health==='PASS')continue;
    incidents.push('LOCAL_'+check.code.replace('campus-','').toUpperCase()+'_'+check.health);
    tasks.push(makeTask(check.code==='campus-native_browser'?'RECHECK_NATIVE_CHROMIUM':'RECHECK_FIRST_PARTY_HEALTH',check.code,false));
  }
  if(providerHealth!=='online'){
    incidents.push('AI_SUPPLIER_'+providerHealth.toUpperCase());
    tasks.push(makeTask('RECHECK_SUPPLIER_PUBLIC_STATUS','supplier',false));
  }
  if(stateOfBrowser!=='online'){
    incidents.push('GOVERNMENT_PORTAL_'+stateOfBrowser.toUpperCase());
    tasks.push(makeTask('RECHECK_PUBLIC_PORTAL_ONLY','government',false));
  }
  if(missingApprovals.length){
    incidents.push('LEGAL_AND_SUPPLIER_AUTHORITY_INCOMPLETE');
    tasks.push(makeTask('REVIEW_CONTRACT_AND_LEGAL_EVIDENCE','compliance',true));
  }
  if(unconfirmedCancellations===null || potentialFourthCharges===null){
    incidents.push('TERMINATION_OBSERVATION_UNKNOWN');
    tasks.push(makeTask('VERIFY_TERMINATION_EVIDENCE','termination-unknown',true));
  }else if(unconfirmedCancellations>0||potentialFourthCharges>0){
    incidents.push('CANCELLATION_CONFIRMATION_REQUIRED');
    tasks.push(makeTask('OBTAIN_PROVIDER_CANCELLATION_PROOF','termination-risk',true));
  }
  const status=!fresh?'OBSERVATION_UNKNOWN':criticalFault?'LOCAL_CONTROL_DEGRADED':
    (potentialFourthCharges===null||potentialFourthCharges>0)?'CANCELLATION_REVIEW_REQUIRED':
    providerHealth!=='online'?'PROVIDER_DEGRADED_CORE_ONLY':
    (localFault||missingApprovals.length||unconfirmedCancellations)?'SAFE_REVIEW_ONLY':'SAFE_CORE_ONLY';
  const uniqueTasks=[...new Map(tasks.map(t=>[t.idempotencyKey,t])).values()];
  return Object.freeze({
    policyId:CAMPUS_INDEPENDENCE_POLICY.id,
    evaluatedAt:new Date(time).toISOString(),
    status,coreAvailable:canUseCore,coreFullyHealthy:coreReady,
    aiModelInvoked:false,externalBrowserInvoked:false,
    moneyTransferred:false,subscriptionChanged:false,legalFilingSubmitted:false,
    paymentAuthorized:false,accountDeletionAuthorized:false,
    independentCoreExpected:true,knownProviderState:providerHealth,
    observationsFresh:fresh,checks,missingApprovalCodes:missingApprovals,
    unconfirmedCancellationCount:unconfirmedCancellations,
    fourthChargeRiskCount:potentialFourthCharges,
    incidents:Object.freeze([...new Set(incidents)]),
    nextActions:Object.freeze(uniqueTasks),
  });
}
