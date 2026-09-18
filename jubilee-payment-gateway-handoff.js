const CANONICAL_PAYMENT_GATEWAY = 'https://ekodi.kr/ekodibiz/pay';

/**
 * Build a server-resolved handoff to the existing EKODIBIZ payment gateway.
 * No browser-supplied amount, price, total or currency is accepted here.
 */
export async function buildJubileePaymentGatewayHandoff(prepared, resolveApprovedOrder) {
  if (!prepared?.ready) throw new Error(prepared?.reason || 'jubilee_financial_not_ready');
  if (prepared.paymentExecutionAllowed !== false) throw new Error('jubilee_payment_execution_boundary_invalid');
  if (prepared.nextAction !== 'human_confirm_payment_gateway') {
    throw new Error('jubilee_payment_human_confirmation_required');
  }
  if (typeof resolveApprovedOrder !== 'function') {
    throw new Error('jubilee_approved_order_resolver_required');
  }

  const order = await resolveApprovedOrder(Object.freeze({
    quoteId: prepared.quote.quoteId,
    candidateId: prepared.candidate.id,
    amountMinor: prepared.payableAmountMinor,
    currency: prepared.currency,
    supportRef: prepared.credit?.supportRef || null,
    policyVersion: prepared.policyVersion,
  }));

  const verified = verifyApprovedOrder(order, prepared);
  const checkout = new URL(CANONICAL_PAYMENT_GATEWAY);
  checkout.searchParams.set('orderId', verified.orderId);

  return Object.freeze({
    status: 'ready_for_human_confirmation',
    orderId: verified.orderId,
    quoteId: prepared.quote.quoteId,
    candidateId: prepared.candidate.id,
    amountMinor: prepared.payableAmountMinor,
    currency: prepared.currency,
    checkoutUrl: checkout.toString(),
    paymentExecutionAllowed: false,
  });
}

function verifyApprovedOrder(raw, prepared) {
  const order = raw && typeof raw === 'object' ? raw : {};
  if (String(order.status || '').trim() !== 'approved') {
    throw new Error('jubilee_payment_order_not_approved');
  }

  const orderId = String(order.orderId || order.order_id || '').trim();
  if (!/^EB-[A-Z0-9-]{6,80}$/.test(orderId)) {
    throw new Error('jubilee_payment_order_id_invalid');
  }

  if (String(order.quoteId || order.quote_id || '').trim() !== prepared.quote.quoteId) {
    throw new Error('jubilee_payment_quote_mismatch');
  }
  if (String(order.candidateId || order.candidate_id || '').trim() !== prepared.candidate.id) {
    throw new Error('jubilee_payment_candidate_mismatch');
  }

  const amountMinor = Number(order.amountMinor ?? order.amount_minor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor !== prepared.payableAmountMinor) {
    throw new Error('jubilee_payment_amount_mismatch');
  }

  const currency = String(order.currency || '').trim().toUpperCase();
  if (currency !== prepared.currency) throw new Error('jubilee_payment_currency_mismatch');

  return Object.freeze({ orderId });
}

export { CANONICAL_PAYMENT_GATEWAY };
