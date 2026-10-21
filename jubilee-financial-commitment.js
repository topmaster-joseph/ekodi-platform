import { authorizeJubileeSelection } from './jubilee-policy-gate.js';

const QUOTE_SOURCES = new Set(['server_quote', 'approved_catalog_price']);
const CREDIT_KINDS = new Set(['jubilee_credit', 'fee_waiver']);

/**
 * Prepare a money-bearing intent only after Jubilee choice authorization.
 * This module never creates a payment, changes a price, or calls a PSP.
 */
export function prepareJubileeFinancialCommitment(input = {}) {
  rejectClientAuthoritativeMoney(input);

  const selection = authorizeJubileeSelection(
    input.gateResult || input.gate,
    input.candidateId || input.candidate_id,
  );
  if (!selection.allowed) {
    return Object.freeze({
      ready: false,
      reason: selection.reason,
      selection,
    });
  }

  const quote = normalizeApprovedQuote(input.quote, selection.candidate.id, input.now);
  const credit = input.credit
    ? normalizeApprovedCredit(input.credit, quote)
    : null;

  const creditAmount = credit?.amountMinor || 0;
  const payableAmountMinor = quote.amountMinor - creditAmount;

  return Object.freeze({
    ready: true,
    reason: 'jubilee_financial_commitment_ready',
    policyVersion: selection.policyVersion,
    candidate: selection.candidate,
    quote,
    credit,
    payableAmountMinor,
    currency: quote.currency,
    paymentExecutionAllowed: false,
    nextAction: 'human_confirm_payment_gateway',
  });
}

export async function commitJubileeFinancialIntent(prepared, adapter) {
  if (!prepared?.ready) throw new Error(prepared?.reason || 'jubilee_financial_not_ready');
  if (typeof adapter !== 'function') throw new Error('jubilee_financial_adapter_required');

  const result = await adapter(Object.freeze({
    candidateId: prepared.candidate.id,
    quoteId: prepared.quote.quoteId,
    amountMinor: prepared.payableAmountMinor,
    currency: prepared.currency,
    policyVersion: prepared.policyVersion,
    supportRef: prepared.credit?.supportRef || null,
  }));

  return Object.freeze({
    accepted: true,
    commitmentRef: safeRef(result?.commitmentRef),
    quoteId: prepared.quote.quoteId,
    candidateId: prepared.candidate.id,
    amountMinor: prepared.payableAmountMinor,
    currency: prepared.currency,
  });
}

function normalizeApprovedQuote(raw, selectedCandidateId, nowValue) {
  const quote = raw && typeof raw === 'object' ? raw : {};
  const quoteId = requiredRef(quote.quoteId || quote.quote_id, 'jubilee_quote_id_required');
  const candidateId = requiredRef(quote.candidateId || quote.candidate_id, 'jubilee_quote_candidate_required');
  if (candidateId !== selectedCandidateId) throw new Error('jubilee_quote_candidate_mismatch');

  const source = String(quote.source || '').trim();
  if (!QUOTE_SOURCES.has(source)) throw new Error('jubilee_trusted_quote_source_required');
  if (String(quote.status || '').trim() !== 'approved') throw new Error('jubilee_approved_quote_required');

  const amountMinor = positiveInteger(quote.amountMinor ?? quote.amount_minor, 'jubilee_quote_amount_invalid');
  const currency = currencyCode(quote.currency);
  assertNotExpired(quote.expiresAt || quote.expires_at, nowValue);

  return Object.freeze({ quoteId, candidateId, source, amountMinor, currency });
}
function normalizeApprovedCredit(raw, quote) {
  const credit = raw && typeof raw === 'object' ? raw : {};
  const kind = String(credit.kind || '').trim();
  if (!CREDIT_KINDS.has(kind)) throw new Error('jubilee_credit_kind_invalid');
  if (String(credit.approvalStatus || credit.approval_status || '').trim() !== 'approved') {
    throw new Error('jubilee_credit_human_approval_required');
  }
  const approvedBy = requiredRef(
    credit.approvedBy || credit.approved_by,
    'jubilee_credit_approver_required',
  );
  const amountMinor = positiveInteger(
    credit.amountMinor ?? credit.amount_minor,
    'jubilee_credit_amount_invalid',
  );
  if (amountMinor > quote.amountMinor) throw new Error('jubilee_credit_exceeds_quote');

  const supportRef = safeUuid(credit.supportRef || credit.support_ref);
  if (!supportRef) throw new Error('jubilee_credit_support_ref_required');

  return Object.freeze({ kind, amountMinor, supportRef, approvedBy });
}

function rejectClientAuthoritativeMoney(input) {
  for (const key of ['amount', 'price', 'total', 'amountMinor', 'amount_minor', 'currency']) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw new Error(`jubilee_client_money_field_rejected:${key}`);
    }
  }
}
function assertNotExpired(value, nowValue) {
  if (!value) return;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('jubilee_quote_expiry_invalid');
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('jubilee_quote_now_invalid');
  if (expiresAt <= now) throw new Error('jubilee_quote_expired');
}

function positiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(code);
  return number;
}

function currencyCode(value) {
  const code = String(value || 'KRW').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('jubilee_currency_invalid');
  return code;
}

function requiredRef(value, code) {
  const ref = String(value || '').trim();
  if (!/^[A-Za-z0-9:._-]{1,200}$/.test(ref)) throw new Error(code);
  return ref;
}

function safeRef(value) {
  const ref = String(value || '').trim();
  return /^[A-Za-z0-9:._-]{1,200}$/.test(ref) ? ref : null;
}

function safeUuid(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null;
}
