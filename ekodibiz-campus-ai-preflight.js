/** 
 * EKODIBIZ university-funded AI subscription preflight (NON-PAYMENT capability).
 * Never purchases subscriptions, accesses user logins, stores payment data or
 * concludes that a license/regulated transaction is lawful.
 * REVIEW_REQUIRED is not a payment authorization.
 */
function dateOnly(input) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new TypeError('START_DATE_INVALID');
  }
  const [year, month, day] = input.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError('START_DATE_INVALID');
  }
  return { year, month, day };
}

function addMonthsClamped({ year, month, day }, months) {
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const maxDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
}

export function proposeThreeMonthBillingSchedule(startDate) {
  const start = dateOnly(startDate);
  return Object.freeze({
    installments: Object.freeze([0, 1, 2].map(offset => addMonthsClamped(start, offset))),
    nextCycleWouldStart: addMonthsClamped(start, 3),
    billingStopRule: 'Cancel with provider-confirmed lead time before any fourth charge',
    providerConfirmationRequired: true,
  });
}

function positiveSafeInteger(n) {
  return Number.isSafeInteger(n) && n > 0;
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function assessCampusAiPaymentPreflight(input) {
  const order = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const blockers = [];
  const requireCheck = (pass, code) => { if (!pass) blockers.push(code); };
  const contract = order.contract || {};
  const provider = order.provider || {};
  const individual = order.individual || {};
  const law = order.law || {};
  const funding = order.funding || {};
  const controls = order.controls || {};
  requireCheck(contract.universitySigned === true && present(contract.reference), 'UNIVERSITY_CONTRACT_MISSING');
  requireCheck(contract.termMonths === 3 && present(contract.startDate), 'THREE_MONTH_TERM_NOT_CONFIRMED');
  if (present(contract.startDate)) {
    try { proposeThreeMonthBillingSchedule(contract.startDate); }
    catch { blockers.push('CONTRACT_START_DATE_INVALID'); }
  }
  requireCheck(provider.writtenThirdPartyPaymentApproval === true && present(provider.approvalReference), 'PROVIDER_WRITTEN_PERMISSION_MISSING');
  requireCheck(provider.supportedBillingIntegration === true, 'PROVIDER_BILLING_INTEGRATION_NOT_VERIFIED');
  requireCheck(provider.confirmedCancellationProcedure === true, 'PROVIDER_CANCELLATION_NOT_VERIFIED');
  requireCheck(individual.accountOwnedByIndividual === true, 'PERSONAL_ACCOUNT_OWNERSHIP_NOT_CONFIRMED');
  requireCheck(individual.informedConsentRecorded === true, 'INDIVIDUAL_CONSENT_MISSING');
  requireCheck(individual.noPasswordOrOtpCollection === true, 'CREDENTIAL_COLLECTION_RISK');
  requireCheck(individual.noForcedWorkspaceMerge === true, 'PERSONAL_DATA_CONTINUITY_RISK');
  requireCheck(individual.endOfSponsorshipNoticeReady === true, 'ENDING_NOTICE_MISSING');
  requireCheck(law.pgClassificationReviewed === true, 'PG_CLASSIFICATION_NOT_CLEARED');
  requireCheck(law.foreignExchangeReviewed === true, 'FOREIGN_EXCHANGE_NOT_CLEARED');
  requireCheck(law.taxAndInvoiceReviewed === true, 'TAX_AND_INVOICE_NOT_CLEARED');
  requireCheck(funding.universityPaymentSettled === true, 'UNIVERSITY_FUNDS_NOT_SETTLED');
  requireCheck(present(funding.currency), 'FUNDING_CURRENCY_MISSING');
  requireCheck(positiveSafeInteger(funding.authorizedCapMinor), 'AUTHORIZED_CAP_INVALID');
  requireCheck(positiveSafeInteger(funding.plannedChargesMinor), 'PLANNED_CHARGE_INVALID');
  if (positiveSafeInteger(funding.authorizedCapMinor) && positiveSafeInteger(funding.plannedChargesMinor)) {
    requireCheck(funding.plannedChargesMinor <= funding.authorizedCapMinor, 'SPENDING_CAP_EXCEEDED');
  }
  requireCheck(controls.manualPaymentApproval === true, 'HUMAN_PAYMENT_APPROVAL_MISSING');
  requireCheck(controls.duplicateChargePrevention === true, 'IDEMPOTENCY_CONTROL_MISSING');
  requireCheck(controls.auditTrailEnabled === true, 'AUDIT_TRAIL_MISSING');
  requireCheck(controls.terminationTrackingEnabled === true, 'TERMINATION_TRACKING_MISSING');
  return Object.freeze({
    status: blockers.length > 0 ? 'BLOCKED' : 'REVIEW_REQUIRED',
    allowCharge: false,
    requiresAuthorizedPaymentCore: true,
    blockers: Object.freeze(blockers),
  });
}
