// EKODI-MALL-PAY-RECON-001 (2026-10-23)
// 에코디몰 결제의 사후 정합성: 토스 웹훅 수신, 주기 대사(cron), 결제대기 만료 정리, 재고 예약 해제.
// 원칙: 웹훅 본문은 신뢰하지 않는다 — 항상 공통 결제 모듈(ekodipay-core)로 토스에 재조회한 결과만 반영한다.
import { raiseAlert, resolveAlerts } from './ops-alerts.js';
import { tossRequest, TossError } from '../../../ekodipay-core.js';
import { commerceEventStatement } from './commerce-events.js';
import { recordConfirmedPayment } from './worker.js';

export const MALL_PAYMENT_PROFILE = 'mall';
// 결제창이 열린 직후의 주문은 건드리지 않는다(사용자가 결제 중일 수 있음).
export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
// 주문 만료(30분) 이후에도 토스 승인 응답이 늦게 올 수 있어 여유를 둔다.
export const EXPIRY_GRACE_MS = 15 * 60 * 1000;
export const RECONCILE_BATCH = 30;
// Check a bounded, fairly rotated slice of already-paid orders as well.
// Otherwise a missed Toss refund webhook can leave the Mall ledger permanently stale.
export const REFUND_RECONCILE_BATCH = 6;
export const REFUND_RECONCILE_MIN_INTERVAL_MS = 30 * 60 * 1000;
export const REFUND_RECONCILE_MAX_AGE_MS = 180 * 86400 * 1000;

const PENDING_TOSS_STATUSES = new Set(['READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT']);
const FAILED_TOSS_STATUSES = new Set(['ABORTED', 'EXPIRED']);
const REFUND_TOSS_STATUSES = new Set(['CANCELED', 'PARTIAL_CANCELED']);

const isoNow = () => new Date().toISOString();
const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const profileOf = env => clean(env?.EKODIPAY_PROFILE, 20) || MALL_PAYMENT_PROFILE;

/** 주문번호로 토스 결제를 조회한다. 토스에 결제가 없으면 null. */
/**
 * Paid orders: look the payment up by the recorded paymentKey first. In live
 * operation (2026-10-25) Toss answered NOT_FOUND to the orderId lookup for a
 * cancelled live payment while the payment itself existed; the paymentKey
 * lookup is the canonical one. Falls back to orderId when no key is recorded.
 */
export async function fetchTossPaymentForOrder(env, orderId, paymentKey = '') {
  const key = clean(paymentKey, 220);
  if (key) {
    try {
      const payment = await tossRequest(env, profileOf(env), `/v1/payments/${encodeURIComponent(key)}`);
      if (payment && payment.orderId === orderId) return payment;
    } catch (error) {
      if (!(error instanceof TossError && (error.status === 404 || error.code === 'NOT_FOUND_PAYMENT'))) throw error;
    }
  }
  return fetchTossPaymentByOrder(env, orderId);
}

async function recordedPaymentKey(env, orderId) {
  const row = await env.DB.prepare("SELECT payment_key FROM order_payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1").bind(orderId).first().catch(() => null);
  return row?.payment_key || '';
}

export async function fetchTossPaymentByOrder(env, orderId) {
  try {
    return await tossRequest(env, profileOf(env), `/v1/payments/orders/${encodeURIComponent(orderId)}`);
  } catch (error) {
    if (error instanceof TossError && (error.status === 404 || error.code === 'NOT_FOUND_PAYMENT')) return null;
    throw error;
  }
}

/** 재고 예약 해제 + 주문 취소를 한 트랜잭션으로. 결제대기 상태일 때만 동작(재실행 안전). */
export function releaseReservationStatements(env, orderId, reason, now = isoNow()) {
  return [
    env.DB.prepare(`UPDATE products SET stock_quantity = stock_quantity + (SELECT stock_reserved FROM orders WHERE id=?)
      WHERE id=(SELECT product_id FROM orders WHERE id=?) AND stock_quantity IS NOT NULL
      AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='payment_pending' AND stock_reserved>0)`).bind(orderId, orderId, orderId),
    env.DB.prepare(`UPDATE orders SET status='cancelled', stock_reserved=0, reconciled_at=?, updated_at=?
      WHERE id=? AND status='payment_pending'`).bind(now, now, orderId),
    commerceEventStatement(env, {
      eventType: 'order.cancelled', aggregateType: 'order', aggregateId: orderId, actor: 'mall-payment-reconciler',
      action: 'order.cancel', idempotencyKey: `order.cancelled:${orderId}`, occurredAt: now, payload: { reason },
    }).statement,
  ];
}

/**
 * 토스에서 재조회한 결제를 주문에 반영한다.
 * 반환 action: recorded | already-recorded | pending | cancelled | refunded | mismatch | ignored
 */
export async function applyVerifiedPayment(env, order, payment, { now = new Date(), allowExpire = false } = {}) {
  const nowIso = now.toISOString();
  if (!payment) {
    if (allowExpire && order.status === 'payment_pending') {
      await env.DB.batch(releaseReservationStatements(env, order.id, 'no-payment-after-expiry', nowIso));
      return { action: 'cancelled', reason: 'no-payment-after-expiry' };
    }
    return { action: 'pending', reason: 'no-payment-yet' };
  }
  const status = clean(payment.status, 40).toUpperCase();
  const amount = Math.trunc(Number(payment.totalAmount));
  if (payment.orderId !== order.id || amount !== Math.trunc(Number(order.gross_amount))) {
    console.error('mall payment mismatch', { orderId: order.id, tossOrderId: payment.orderId, amount, expected: order.gross_amount });
    return { action: 'mismatch' };
  }
  if (status === 'DONE') {
    if (order.status === 'paid') return { action: 'already-recorded' };
    if (order.status !== 'payment_pending') {
      // 이미 취소 처리된 주문에 승인이 도착 — 돈은 받았으므로 기록은 남기고 사람이 판단하게 한다.
      console.error('mall payment DONE on non-pending order', { orderId: order.id, status: order.status });
      await recordPaymentRowOnly(env, order, payment, nowIso);
      return { action: 'mismatch', reason: 'paid-after-cancel' };
    }
    await recordConfirmedPayment(env, order, payment, 'TOSS');
    await env.DB.prepare('UPDATE orders SET stock_reserved=0, reconciled_at=? WHERE id=?').bind(nowIso, order.id).run();
    return { action: 'recorded' };
  }
  if (REFUND_TOSS_STATUSES.has(status)) {
    // 환불은 토스 상점관리자에서 수동 처리 → 웹훅/대사로 주문·정산에 반영.
    if (order.status === 'payment_pending') {
      await env.DB.batch(releaseReservationStatements(env, order.id, `toss-${status.toLowerCase()}`, nowIso));
      return { action: 'cancelled', reason: status };
    }
    const nextStatus = status === 'CANCELED' ? 'refunded' : 'partially_refunded';
    const cancels = Array.isArray(payment.cancels) ? payment.cancels : [];
    const refunded = cancels.reduce((sum, c) => sum + Math.trunc(Number(c?.cancelAmount) || 0), 0);
    await env.DB.batch([
      env.DB.prepare('UPDATE orders SET status=?, reconciled_at=?, updated_at=? WHERE id=? AND status IN (\'paid\',\'partially_refunded\')').bind(nextStatus, nowIso, nowIso, order.id),
      env.DB.prepare('UPDATE order_payments SET status=?, updated_at=? WHERE order_id=?').bind(status, nowIso, order.id),
      env.DB.prepare(`UPDATE settlement_ledger SET status='reversed' WHERE order_id=? AND entry_type='sale' AND status='pending' AND ?='refunded'`).bind(order.id, nextStatus),
      commerceEventStatement(env, {
        eventType: 'payment.refunded', aggregateType: 'order', aggregateId: order.id, actor: 'mall-payment-reconciler',
        action: 'payment.refund', idempotencyKey: `payment.refunded:${order.id}:${status}:${refunded}`, occurredAt: nowIso,
        payload: { status, refundedAmount: refunded, cancelCount: cancels.length },
      }).statement,
    ]);
    return { action: 'refunded', status: nextStatus, refundedAmount: refunded };
  }
  if (FAILED_TOSS_STATUSES.has(status)) {
    if (order.status !== 'payment_pending') return { action: 'ignored' };
    await env.DB.batch(releaseReservationStatements(env, order.id, `toss-${status.toLowerCase()}`, nowIso));
    return { action: 'cancelled', reason: status };
  }
  if (PENDING_TOSS_STATUSES.has(status)) return { action: 'pending', reason: status };
  return { action: 'ignored', reason: status || 'unknown' };
}

async function recordPaymentRowOnly(env, order, payment, nowIso) {
  await env.DB.prepare(`INSERT INTO order_payments
    (payment_key,order_id,provider,status,method,total_amount,approved_at,metadata_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(payment_key) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`)
    .bind(clean(payment.paymentKey, 220), order.id, 'TOSS', 'DONE_NEEDS_REVIEW', clean(payment.method, 80),
      Math.trunc(Number(payment.totalAmount) || 0), payment.approvedAt || null, '{"review":"paid-after-cancel"}', nowIso, nowIso)
    .run().catch(error => console.error('mall review payment row', error));
}

/** 토스 웹훅. 본문의 주문번호만 쓰고 상태는 토스 재조회로 확정한다. */
export async function handleTossWebhook(env, body) {
  const orderId = clean(body?.data?.orderId || body?.orderId, 80);
  if (!orderId) return { status: 200, body: { ok: true, ignored: 'no-order-id' } };
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  // 같은 상점(MID)을 쓰는 다른 서비스(큐티인 등)의 주문이면 무시 — 200을 돌려 토스 재전송을 막는다.
  if (!order) return { status: 200, body: { ok: true, ignored: 'not-a-mall-order' } };
  let payment;
  try {
    payment = await fetchTossPaymentForOrder(env, orderId, clean(body?.data?.paymentKey || body?.paymentKey, 220) || await recordedPaymentKey(env, orderId));
  } catch (error) {
    console.error('mall webhook toss lookup failed', { orderId, code: error?.code });
    return { status: 502, body: { ok: false, retry: true } }; // 토스가 재전송한다.
  }
  const result = await applyVerifiedPayment(env, order, payment, { allowExpire: false });
  return { status: 200, body: { ok: true, orderId, action: result.action } };
}

/** 주기 대사: 결제대기 주문을 토스와 맞추고, 만료 + 유예가 지난 미결제 주문은 취소·재고 해제. */
export async function reconcileMallPayments(env, { now = new Date(), limit = RECONCILE_BATCH, refundLimit = REFUND_RECONCILE_BATCH } = {}) {
  const summary = { checked: 0, recorded: 0, cancelled: 0, refunded: 0, pending: 0, mismatch: 0, errors: 0, paidChecked: 0, refundRecovered: 0 };
  if (!env?.DB) return { ...summary, skipped: 'no-db' };
  const cutoff = new Date(now.getTime() - RECONCILE_MIN_AGE_MS).toISOString();
  const rows = await env.DB.prepare(`SELECT * FROM orders WHERE status='payment_pending' AND created_at<=?
    ORDER BY reconcile_attempts ASC, created_at ASC LIMIT ?`).bind(cutoff, Math.max(1, Math.min(100, limit))).all();
  for (const order of rows.results || []) {
    summary.checked += 1;
    try {
      const payment = await fetchTossPaymentByOrder(env, order.id);
      const expiresAt = Date.parse(order.expires_at || '');
      const pastGrace = Number.isFinite(expiresAt) && expiresAt + EXPIRY_GRACE_MS <= now.getTime();
      const result = await applyVerifiedPayment(env, order, payment, { now, allowExpire: pastGrace });
      if (result.action === 'recorded') summary.recorded += 1;
      else if (result.action === 'cancelled') summary.cancelled += 1;
      else if (result.action === 'refunded') summary.refunded += 1;
      else if (result.action === 'mismatch') summary.mismatch += 1;
      else summary.pending += 1;
    } catch (error) {
      summary.errors += 1;
      console.error('mall reconcile order failed', { orderId: order.id, code: error?.code, message: error?.message });
      await raiseAlert(env, { severity: 'warn', kind: 'payment.reconcile_failed', orderId: order.id, message: `${error?.code || error?.status || 'error'} ${error?.message || ''}` });
    }
    await env.DB.prepare('UPDATE orders SET reconcile_attempts=reconcile_attempts+1 WHERE id=?').bind(order.id).run().catch(() => {});
  }

  // Missed webhook recovery: periodically re-check paid/partially-refunded orders.
  // The oldest last-checked orders go first; the time/age bounds prevent unbounded
  // Toss queries and avoid querying other EKODI services sharing the same MID.
  const paidBatchSize = Math.max(0, Math.min(20, Math.trunc(Number(refundLimit) || 0)));
  if (paidBatchSize) {
    const recent = new Date(now.getTime() - REFUND_RECONCILE_MAX_AGE_MS).toISOString();
    const eligible = new Date(now.getTime() - REFUND_RECONCILE_MIN_INTERVAL_MS).toISOString();
    const paidRows = await env.DB.prepare(`SELECT * FROM orders
      WHERE status IN ('paid','partially_refunded') AND created_at >= ?
        AND (reconciled_at IS NULL OR reconciled_at <= ?)
      ORDER BY COALESCE(reconciled_at, '') ASC, created_at ASC LIMIT ?`)
      .bind(recent, eligible, paidBatchSize).all();
    for (const order of paidRows.results || []) {
      summary.checked += 1;
      summary.paidChecked += 1;
      try {
        const payment = await fetchTossPaymentForOrder(env, order.id, await recordedPaymentKey(env, order.id));
        // A missing Toss payment does not downgrade a recorded paid order.
        if (payment) {
          const result = await applyVerifiedPayment(env, order, payment, { now });
          if (result.action === 'refunded') {
            summary.refunded += 1;
            summary.refundRecovered += 1;
            await raiseAlert(env, { severity: 'info', kind: 'payment.refund_recorded', orderId: order.id, message: `토스 취소 확인 · ${result.status} · ${result.refundedAmount}원` });
          } else if (result.action === 'mismatch') {
            summary.mismatch += 1;
            await raiseAlert(env, { severity: 'error', kind: 'payment.mismatch', orderId: order.id, message: result.reason || 'amount-or-order-mismatch' });
          }
          await resolveAlerts(env, { kind: 'payment.reconcile_failed', orderId: order.id });
          await resolveAlerts(env, { kind: 'payment.reconcile_not_found', orderId: order.id });
        } else {
          await raiseAlert(env, { severity: 'warn', kind: 'payment.reconcile_not_found', orderId: order.id, message: '토스에서 결제를 찾지 못함 (키 모드·상점 불일치 가능)' });
        }
      } catch (error) {
        summary.errors += 1;
        console.error('mall paid refund reconciliation failed', { orderId: order.id, code: error?.code, message: error?.message });
        await raiseAlert(env, { severity: 'warn', kind: 'payment.reconcile_failed', orderId: order.id, message: `${error?.code || error?.status || 'error'} ${error?.message || ''}` });
      } finally {
        // Rotate even failed lookups: one unavailable payment must not starve every
        // other order on the next 10-minute cron. Re-eligible after the cooldown.
        await env.DB.prepare(`UPDATE orders SET reconciled_at=?, reconcile_attempts=reconcile_attempts+1
          WHERE id=? AND status IN ('paid','partially_refunded')`).bind(now.toISOString(), order.id).run().catch(() => {});
      }
    }
  }
  return summary;
}

export async function inventorySchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const rows = await env.DB.prepare("SELECT name FROM pragma_table_info('orders')").all();
    return (rows.results || []).some(r => r.name === 'stock_reserved');
  } catch {
    return false;
  }
}
