import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptBenefitRadarAssessment,
  recordBenefitRadarPoolCommitment,
  recordBenefitRadarSupport,
} from '../jubilee-benefit-radar-adapter.js';
import { evaluateJubileeRecommendation } from '../jubilee-runtime.js';
import { createJubileeOperationalStore } from '../jubilee-operational-store.js';

test('Benefit Radar exports only bounded operational signals to Jubilee', () => {
  const adapted = adaptBenefitRadarAssessment({
    needScore: 0.98,
    confidence: 0.91,
    category: 'high-vulnerability',
    beneficiaryIdentity: { name: 'private' },
    sensitiveTraits: ['private'],
    supportSignals: [
      { type: 'affordability_constraint', source: 'consented' },
      { type: 'unknown_private_signal', source: 'consented' },
    ],
  });

  assert.deepEqual(adapted.context.needSignals, [
    { type: 'affordability_constraint', source: 'consented' },
  ]);
  assert.equal('needScore' in adapted, false);
  assert.equal('confidence' in adapted, false);
  assert.equal('category' in adapted, false);
  assert.equal('beneficiaryIdentity' in adapted, false);
});
test('Jubilee derives support actions without receiving Benefit Radar scores', () => {
  const adapted = adaptBenefitRadarAssessment({
    needScore: 1,
    supportSignals: [
      { type: 'affordability_constraint', source: 'program_eligibility_verified' },
    ],
  });
  const result = evaluateJubileeRecommendation({
    context: adapted.context,
    candidates: [{ id: 'service', source: 'external', userFit: 0.9 }],
  });

  assert.ok(result.supportActions.includes('consider_fee_waiver'));
  assert.ok(result.supportActions.includes('consider_jubilee_credit'));
  assert.equal(JSON.stringify(result).includes('needScore'), false);
});

test('support execution persists only opaque support_ref and approved action codes', async () => {
  const rows = [];
  const store = createJubileeOperationalStore({
    appendPolicyEvent: async () => {},
    appendSupportEvents: async events => rows.push(...events),
    appendPoolEntry: async () => {},
  });

  const events = await recordBenefitRadarSupport({
    assessment: {
      needScore: 0.99,
      beneficiaryIdentity: { name: 'private' },
      supportSignals: [{ type: 'affordability_constraint', source: 'consented' }],
    },
    requestId: 'req-benefit-1',
    workspaceId: 'ws-benefit',
    policyVersion: '1.0.0',
    supportActions: ['consider_fee_waiver', 'consider_jubilee_credit'],
    deliveryStatus: 'offered',
    executedBy: 'service:benefit-radar',
  }, store);

  assert.equal(events.length, 2);
  assert.equal(rows.length, 2);
  assert.match(rows[0].support_ref, /^[0-9a-f-]{36}$/);
  assert.equal(rows[0].support_ref, rows[1].support_ref);
  assert.equal('beneficiaryIdentity' in rows[0], false);
  assert.equal('needScore' in rows[0], false);
  assert.deepEqual(
    rows.map(row => row.action_code).sort(),
    ['consider_fee_waiver', 'consider_jubilee_credit'].sort(),
  );
});

test('invalid inbound support_ref is never persisted as identity-like text', async () => {
  const adapted = adaptBenefitRadarAssessment({
    support_ref: 'person@example.com',
    supportSignals: [{ type: 'access_barrier', source: 'user_provided' }],
  });
  assert.equal(adapted.supportRef, null);
});

test('Jubilee Pool commitment requires explicit human approval', async () => {
  const store = createJubileeOperationalStore({
    appendPolicyEvent: async () => {},
    appendSupportEvents: async () => {},
    appendPoolEntry: async () => {},
  });

  await assert.rejects(
    () => recordBenefitRadarPoolCommitment({
      assessment: {},
      amountMinor: 10000,
      policyVersion: '1.0.0',
      approvalStatus: 'pending',
    }, store),
    /jubilee_pool_human_approval_required/,
  );
});

test('approved Pool commitment stores money and opaque ref, not beneficiary reasons', async () => {
  const rows = [];
  const store = createJubileeOperationalStore({
    appendPolicyEvent: async () => {},
    appendSupportEvents: async () => {},
    appendPoolEntry: async row => rows.push(row),
  });
  const entry = await recordBenefitRadarPoolCommitment({
    assessment: {
      needScore: 0.97,
      beneficiaryIdentity: { name: 'private' },
      supportSignals: [{ type: 'affordability_constraint', source: 'consented' }],
    },
    workspaceId: 'ws-benefit',
    amountMinor: 25000,
    currency: 'KRW',
    purpose: 'fee_relief',
    policyVersion: '1.0.0',
    approvalStatus: 'approved',
    approvedBy: 'admin:super',
  }, store);

  assert.equal(rows.length, 1);
  assert.equal(entry.entry_type, 'support_commitment');
  assert.equal(entry.amount_minor, 25000);
  assert.match(entry.support_ref, /^[0-9a-f-]{36}$/);
  assert.equal('beneficiaryIdentity' in entry, false);
  assert.equal('needScore' in entry, false);
  assert.equal('supportSignals' in entry, false);
});
