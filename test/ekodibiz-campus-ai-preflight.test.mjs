import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCampusAiPaymentPreflight,
  proposeThreeMonthBillingSchedule,
} from '../ekodibiz-campus-ai-preflight.js';

function completeExample() {
  return {
    contract: { universitySigned: true, reference: 'synthetic-contract', termMonths: 3, startDate: '2026-11-30' },
    provider: {
      writtenThirdPartyPaymentApproval: true,
      approvalReference: 'synthetic-approval',
      supportedBillingIntegration: true,
      confirmedCancellationProcedure: true,
    },
    individual: {
      accountOwnedByIndividual: true,
      informedConsentRecorded: true,
      noPasswordOrOtpCollection: true,
      noForcedWorkspaceMerge: true,
      endOfSponsorshipNoticeReady: true,
    },
    law: { pgClassificationReviewed: true, foreignExchangeReviewed: true, taxAndInvoiceReviewed: true },
    funding: { universityPaymentSettled: true, currency: 'KRW', authorizedCapMinor: 300000, plannedChargesMinor: 200000 },
    controls: { manualPaymentApproval: true, duplicateChargePrevention: true, auditTrailEnabled: true, terminationTrackingEnabled: true },
  };
}

test('all evidence present still requires human and payment-core authorization; no live charge', () => {
  assert.deepEqual(assessCampusAiPaymentPreflight(completeExample()), {
    status: 'REVIEW_REQUIRED', allowCharge: false, requiresAuthorizedPaymentCore: true, blockers: [],
  });
});
test('missing legal/provider approval fails closed, without exposing user payload', () => {
  const example = completeExample();
  example.provider.writtenThirdPartyPaymentApproval = false;
  example.law.pgClassificationReviewed = false;
  example.individual.password = 'sensitive-never-echo';
  const result = assessCampusAiPaymentPreflight(example);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.allowCharge, false);
  assert.ok(result.blockers.includes('PG_CLASSIFICATION_NOT_CLEARED'));
  assert.ok(result.blockers.includes('PROVIDER_WRITTEN_PERMISSION_MISSING'));
  assert.equal(JSON.stringify(result).includes('sensitive-never-echo'), false);
});
test('personal login collection, workspace merge and missing consent block', () => {
  const example = completeExample();
  example.individual.noPasswordOrOtpCollection = false;
  example.individual.noForcedWorkspaceMerge = false;
  example.individual.informedConsentRecorded = false;
  const result = assessCampusAiPaymentPreflight(example);
  assert.ok(result.blockers.includes('CREDENTIAL_COLLECTION_RISK'));
  assert.ok(result.blockers.includes('PERSONAL_DATA_CONTINUITY_RISK'));
  assert.ok(result.blockers.includes('INDIVIDUAL_CONSENT_MISSING'));
});
test('settlement, charge cap, duplicate guard and termination guard are mandatory', () => {
  const example = completeExample();
  example.funding.universityPaymentSettled = false;
  example.funding.plannedChargesMinor = 400000;
  example.controls.duplicateChargePrevention = false;
  example.controls.terminationTrackingEnabled = false;
  const result = assessCampusAiPaymentPreflight(example);
  for (const code of ['UNIVERSITY_FUNDS_NOT_SETTLED', 'SPENDING_CAP_EXCEEDED', 'IDEMPOTENCY_CONTROL_MISSING', 'TERMINATION_TRACKING_MISSING']) {
    assert.ok(result.blockers.includes(code));
  }
});
test('3 month schedule clamps month-end and crosses year', () => {
  assert.deepEqual(proposeThreeMonthBillingSchedule('2026-11-30').installments, ['2026-11-30', '2026-12-30', '2027-01-30']);
  assert.equal(proposeThreeMonthBillingSchedule('2026-11-30').nextCycleWouldStart, '2027-02-28');
  assert.deepEqual(proposeThreeMonthBillingSchedule('2027-01-31').installments, ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.equal(proposeThreeMonthBillingSchedule('2027-01-31').nextCycleWouldStart, '2027-04-30');
});
test('invalid dates or terms cannot pass preflight', () => {
  assert.throws(() => proposeThreeMonthBillingSchedule('2026-02-30'), /START_DATE_INVALID/);
  const example = completeExample();
  example.contract.startDate = '2026-02-30';
  example.contract.termMonths = 4;
  const result = assessCampusAiPaymentPreflight(example);
  assert.ok(result.blockers.includes('CONTRACT_START_DATE_INVALID'));
  assert.ok(result.blockers.includes('THREE_MONTH_TERM_NOT_CONFIRMED'));
});
test('unset input fails closed instead of throwing', () => {
  assert.equal(assessCampusAiPaymentPreflight(null).status, 'BLOCKED');
  assert.equal(assessCampusAiPaymentPreflight({}).allowCharge, false);
});
