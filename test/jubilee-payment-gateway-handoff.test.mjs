import test from 'node:test';
import assert from 'node:assert/strict';

import { runJubileePolicyGate } from '../jubilee-policy-gate.js';
import { prepareJubileeFinancialCommitment } from '../jubilee-financial-commitment.js';
import { buildJubileePaymentGatewayHandoff } from '../jubilee-payment-gateway-handoff.js';

async function preparedIntent() {
  const gate = await runJubileePolicyGate({
    candidates: [
      { id: 'ekodi-offer', source: 'ekodi', userFit: 0.8 },
      { id: 'outside-offer', source: 'external', userFit: 0.9 },
    ],
  });
  return prepareJubileeFinancialCommitment({
    gateResult: gate,
    candidateId: 'outside-offer',
    quote: {
      quoteId: 'QUOTE-100',
      candidateId: 'outside-offer',
      source: 'server_quote',
      status: 'approved',
      amountMinor: 120000,
      currency: 'KRW',
    },
  });
}
test('handoff sends only orderId to the canonical payment gateway', async () => {
  const prepared = await preparedIntent();
  const handoff = await buildJubileePaymentGatewayHandoff(prepared, async intent => ({
    status: 'approved',
    orderId: 'EB-JUBILEE-100',
    quoteId: intent.quoteId,
    candidateId: intent.candidateId,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
  }));

  const url = new URL(handoff.checkoutUrl);
  assert.equal(url.origin, 'https://ekodi.kr');
  assert.equal(url.pathname, '/ekodibiz/pay');
  assert.equal(url.searchParams.get('orderId'), 'EB-JUBILEE-100');
  assert.deepEqual([...url.searchParams.keys()], ['orderId']);
  assert.equal(handoff.paymentExecutionAllowed, false);
  assert.equal(handoff.status, 'ready_for_human_confirmation');
});

test('server order must match the evaluated quote, candidate and amount', async () => {
  const prepared = await preparedIntent();
  const base = {
    status: 'approved',
    orderId: 'EB-JUBILEE-101',
    quoteId: 'QUOTE-100',
    candidateId: 'outside-offer',
    amountMinor: 120000,
    currency: 'KRW',
  };
  for (const [patch, code] of [
    [{ quoteId: 'QUOTE-WRONG' }, /jubilee_payment_quote_mismatch/],
    [{ candidateId: 'hidden-offer' }, /jubilee_payment_candidate_mismatch/],
    [{ amountMinor: 119999 }, /jubilee_payment_amount_mismatch/],
    [{ currency: 'USD' }, /jubilee_payment_currency_mismatch/],
  ]) {
    await assert.rejects(
      () => buildJubileePaymentGatewayHandoff(prepared, async () => ({ ...base, ...patch })),
      code,
    );
  }
});

test('unapproved or malformed orders never produce a checkout handoff', async () => {
  const prepared = await preparedIntent();
  await assert.rejects(
    () => buildJubileePaymentGatewayHandoff(prepared, async () => ({ status: 'pending' })),
    /jubilee_payment_order_not_approved/,
  );
  await assert.rejects(
    () => buildJubileePaymentGatewayHandoff(prepared, async () => ({
      status: 'approved',
      orderId: 'BAD-1',
      quoteId: 'QUOTE-100',
      candidateId: 'outside-offer',
      amountMinor: 120000,
      currency: 'KRW',
    })),
    /jubilee_payment_order_id_invalid/,
  );
});
