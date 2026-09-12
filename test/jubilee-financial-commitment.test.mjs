import test from 'node:test';
import assert from 'node:assert/strict';

import { runJubileePolicyGate } from '../jubilee-policy-gate.js';
import {
  commitJubileeFinancialIntent,
  prepareJubileeFinancialCommitment,
} from '../jubilee-financial-commitment.js';

const SUPPORT_REF = '123e4567-e89b-42d3-a456-426614174000';

async function readyGate() {
  return runJubileePolicyGate({
    candidates: [
      { id: 'ekodi-offer', source: 'ekodi', userFit: 0.82 },
      { id: 'outside-offer', source: 'external', userFit: 0.91 },
    ],
  });
}

function approvedQuote(candidateId = 'outside-offer') {
  return {
    quoteId: 'QUOTE-001',
    candidateId,
    source: 'server_quote',
    status: 'approved',
    amountMinor: 100000,
    currency: 'KRW',
    expiresAt: '2026-09-05T00:00:00+09:00',
  };
}
test('financial commitment uses the explicit Jubilee-selected candidate and trusted quote', async () => {
  const gate = await readyGate();
  const prepared = prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: approvedQuote(),
    now: '2026-09-04T16:00:00+09:00',
  });

  assert.equal(prepared.ready, true);
  assert.equal(prepared.candidate.id, 'outside-offer');
  assert.equal(prepared.payableAmountMinor, 100000);
  assert.equal(prepared.paymentExecutionAllowed, false);
  assert.equal(prepared.nextAction, 'human_confirm_payment_gateway');
});

test('client supplied authoritative amount or price is rejected', async () => {
  const gate = await readyGate();
  for (const field of ['amount', 'price', 'total', 'amountMinor', 'currency']) {
    assert.throws(() => prepareJubileeFinancialCommitment({
      gateResult: gate,
      candidateId: 'outside-offer',
      quote: approvedQuote(),
      [field]: field === 'currency' ? 'KRW' : 1,
    }), /jubilee_client_money_field_rejected/);
  }
});
test('quote must belong to the selected candidate and come from a trusted server source', async () => {
  const gate = await readyGate();
  assert.throws(() => prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: approvedQuote('ekodi-offer'),
  }), /jubilee_quote_candidate_mismatch/);

  assert.throws(() => prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: { ...approvedQuote(), source: 'browser' },
  }), /jubilee_trusted_quote_source_required/);
});

test('expired or unapproved quotes fail closed', async () => {
  const gate = await readyGate();
  assert.throws(() => prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: { ...approvedQuote(), status: 'draft' },
  }), /jubilee_approved_quote_required/);

  assert.throws(() => prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: approvedQuote(),
    now: '2026-09-06T00:00:00+09:00',
  }), /jubilee_quote_expired/);
});
test('Jubilee credit reduces an approved quote only after explicit human approval', async () => {
  const gate = await readyGate();
  const prepared = prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: approvedQuote(),
    credit: {
      kind: 'jubilee_credit',
      approvalStatus: 'approved',
      approvedBy: 'admin:super',
      amountMinor: 25000,
      supportRef: SUPPORT_REF,
    },
    now: '2026-09-04T16:00:00+09:00',
  });

  assert.equal(prepared.payableAmountMinor, 75000);
  assert.equal(prepared.credit.supportRef, SUPPORT_REF);
  assert.equal(prepared.credit.approvedBy, 'admin:super');
});

test('credit cannot execute without approval, opaque support ref, or within quote amount', async () => {
  const gate = await readyGate();
  const base = {
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: approvedQuote(),
  };
  assert.throws(() => prepareJubileeFinancialCommitment({
    ...base,
    credit: {
      kind: 'jubilee_credit',
      approvalStatus: 'pending',
      approvedBy: 'admin:super',
      amountMinor: 10000,
      supportRef: SUPPORT_REF,
    },
  }), /jubilee_credit_human_approval_required/);

  assert.throws(() => prepareJubileeFinancialCommitment({
    ...base,
    credit: {
      kind: 'jubilee_credit',
      approvalStatus: 'approved',
      approvedBy: 'admin:super',
      amountMinor: 10000,
      supportRef: 'person@example.com',
    },
  }), /jubilee_credit_support_ref_required/);

  assert.throws(() => prepareJubileeFinancialCommitment({
    ...base,
    credit: {
      kind: 'jubilee_credit',
      approvalStatus: 'approved',
      approvedBy: 'admin:super',
      amountMinor: 100001,
      supportRef: SUPPORT_REF,
    },
  }), /jubilee_credit_exceeds_quote/);
});
test('financial adapter receives only the evaluated selection and approved server money', async () => {
  const gate = await readyGate();
  const prepared = prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: approvedQuote(),
    now: '2026-09-04T16:00:00+09:00',
  });
  const calls = [];
  const committed = await commitJubileeFinancialIntent(prepared, async intent => {
    calls.push(intent);
    return { commitmentRef: 'payment-intent:001' };
  });

  assert.deepEqual(calls[0], {
    candidateId: 'outside-offer',
    quoteId: 'QUOTE-001',
    amountMinor: 100000,
    currency: 'KRW',
    policyVersion: '1.0.0',
    supportRef: null,
  });
  assert.equal(committed.commitmentRef, 'payment-intent:001');
});

test('a hidden candidate cannot create a financial intent', async () => {
  const gate = await readyGate();
  const prepared = prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'hidden-margin-offer',
    quote: approvedQuote('hidden-margin-offer'),
  });
  assert.equal(prepared.ready, false);
  assert.equal(prepared.reason, 'candidate_not_in_jubilee_choice_set');
});
