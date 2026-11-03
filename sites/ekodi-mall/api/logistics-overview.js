// EKODI-LOGISTICS-PHASE1: seller-scoped, read-only logistics projection.
// A capability projection, NOT a carrier booking/financial execution system.
// Never copy buyer PII or create an action path here.
// Advisory only: these states require human review, not automated order execution.
const ACTION_GUIDANCE = Object.freeze({
  failed: { priority: 0, label: '실패 확인', nextAction: '오류 원인과 공급자 기록을 확인하고 재처리 여부를 판단합니다.' },
  cancel_requested: { priority: 1, label: '취소 요청', nextAction: '공급자 접수 상태를 확인하고 취소 절차를 검토합니다.' },
  return_requested: { priority: 1, label: '반품 요청', nextAction: '반품 승인과 회수 일정을 확인합니다.' },
  refund_pending: { priority: 1, label: '환불 확인 대기', nextAction: '반품·정산 증빙을 확인합니다. 실제 환불은 별도 승인입니다.' },
  awaiting_pii: { priority: 2, label: '배송정보 승인 대기', nextAction: '계약과 처리위탁 권한을 확인하고 승인된 정보 참조를 준비합니다.' },
  ready_to_forward: { priority: 2, label: '발주 준비', nextAction: '공급계약·재고·마진 및 발주 실행 게이트를 확인합니다.' }
});
const ATTENTION = new Set(Object.keys(ACTION_GUIDANCE));
const QUEUE_LIMIT = 20;
const safeIdentifier = (value, max = 120) => {
  const str = String(value ?? '');
  return /^[A-Za-z0-9_-]+$/.test(str) ? str.slice(0, max) : '';
};
function safeAttentionItem(row, status) {
  const guidance = ACTION_GUIDANCE[status];
  return {
    fulfillmentId: safeIdentifier(row?.id, 80),
    orderId: safeIdentifier(row?.orderId, 120),
    status,
    priority: guidance.priority,
    label: guidance.label,
    nextAction: guidance.nextAction
  };
}
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
  const needsReview = [];
  for (const row of rows) {
    const status = String(row?.status || '');
    if (status === 'awaiting_pii') counts.awaitingPii += 1;
    if (status === 'ready_to_forward') counts.readyToForward += 1;
    if (ACTIVE.has(status)) counts.active += 1;
    if (status === 'shipped') counts.shipped += 1;
    if (status === 'delivered') counts.delivered += 1;
    if (RETURN.has(status)) counts.returns += 1;
    if (ATTENTION.has(status)) {
      counts.attention += 1;
      needsReview.push(safeAttentionItem(row, status));
    }
    if (status === 'closed' || status === 'cancelled') counts.closed += 1;
    supplierPayablePlannedAmount += nonnegativeAmount(row?.supplierPayableAmount);
  }
  needsReview.sort((a, b) => a.priority - b.priority);
  const attentionQueue = needsReview.slice(0, QUEUE_LIMIT);
  const attentionQueueTruncated = needsReview.length > QUEUE_LIMIT;
  const piiGate = gates?.buyerPiiReleaseEnabled === true;
  const forwardGate = gates?.supplierForwardEnabled === true;
  return {
    scope: 'authenticated-seller',
    sampledOrderCount: rows.length,
    latest100Only: rows.length >= 100,
    counts,
    attentionQueue,
    attentionQueueTruncated,
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
