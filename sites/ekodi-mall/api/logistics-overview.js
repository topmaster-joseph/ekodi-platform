// EKODI-LOGISTICS-PHASE1: seller-scoped, read-only logistics projection.
// A capability projection, NOT a carrier booking/financial execution system.
// Never copy buyer PII or create an action path here.
const ATTENTION = new Set(['failed', 'cancel_requested', 'return_requested', 'refund_pending']);
const ACTIVE = new Set(['ready_to_forward', 'forwarded', 'accepted', 'shipped']);
const RETURN = new Set(['return_requested', 'returned', 'refund_pending']);

function nonnegativeAmount(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000 ? n : 0;
}

export function buildSellerLogisticsOverview(fulfillments = [], gates = {}) {
  const rows = Array.isArray(fulfillments) ? fulfillments : [];
  const counts = {
    awaitingPii: 0, readyToForward: 0, active: 0, shipped: 0,
    delivered: 0, returns: 0, attention: 0, closed: 0
  };
  let supplierPayablePlannedAmount = 0;
  for (const row of rows) {
    const status = String(row?.status || '');
    if (status === 'awaiting_pii') counts.awaitingPii += 1;
    if (status === 'ready_to_forward') counts.readyToForward += 1;
    if (ACTIVE.has(status)) counts.active += 1;
    if (status === 'shipped') counts.shipped += 1;
    if (status === 'delivered') counts.delivered += 1;
    if (RETURN.has(status)) counts.returns += 1;
    if (ATTENTION.has(status)) counts.attention += 1;
    if (status === 'closed' || status === 'cancelled') counts.closed += 1;
    supplierPayablePlannedAmount += nonnegativeAmount(row?.supplierPayableAmount);
  }
  const piiGate = gates?.buyerPiiReleaseEnabled === true;
  const forwardGate = gates?.supplierForwardEnabled === true;
  return {
    scope: 'authenticated-seller',
    sampledOrderCount: rows.length,
    latest100Only: rows.length >= 100,
    counts,
    supplierPayablePlannedAmount, // planned supplier obligation, never an executed payout
    execution: {
      buyerPiiReleaseEnabled: piiGate,
      supplierForwardEnabled: forwardGate,
      dashboardReadOnly: true,
      payoutExecutionEnabled: false,
      refundExecutionEnabled: false
    },
    guidance: [
      '주문·공급계약·개인정보 처리 권한을 확인하기 전에는 발주를 실행하지 않습니다.',
      '공급자 지급·환불·외부 택배 계약은 별도 권한과 승인 절차가 필요합니다.'
    ]
  };
}
