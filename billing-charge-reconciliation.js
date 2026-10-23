// Shared outcome resolution for recurring Toss billing charges.
//
// Invariant: a renewal is only marked failed (and the subscriber demoted to
// past_due) when the payment provider has definitively NOT captured money.
// Anything ambiguous - network loss, provider 5xx, an in-flight status - stays
// in `processing` and is settled later by `reconcileStaleCharges`, which asks
// the provider again by orderId. This prevents "paid but demoted" customers and
// prevents stuck cycles from silently granting free service forever.

export const PROVIDER_PAID_STATUSES = Object.freeze(new Set(['DONE', 'PARTIAL_CANCELED']));
export const PROVIDER_FAILED_STATUSES = Object.freeze(new Set(['ABORTED', 'EXPIRED', 'CANCELED']));
export const PROVIDER_NOT_FOUND_CODES = Object.freeze(new Set(['NOT_FOUND_PAYMENT', 'NOT_FOUND']));

export const STALE_PROCESSING_MS = 10 * 60 * 1000;
export const ATTENTION_AFTER_MS = 24 * 60 * 60 * 1000;
export const PENDING_RECONCILE_PREFIX = 'pending_reconcile:';

function detailOf(error) {
  return String(error?.data?.code || error?.message || error || 'unknown').slice(0, 200);
}

function isProviderRejection(error) {
  const status = Number(error?.status);
  // Toss answered with a client error: the charge request was evaluated and refused.
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;
}

function isNotFound(error) {
  return Number(error?.status) === 404 || PROVIDER_NOT_FOUND_CODES.has(String(error?.data?.code || ''));
}

/** Classify a provider Payment object. */
export function classifyPayment(payment) {
  const status = String(payment?.status || '');
  if (PROVIDER_PAID_STATUSES.has(status)) return { outcome:'done', payment };
  if (PROVIDER_FAILED_STATUSES.has(status)) return { outcome:'failed', payment, detail:`payment_status_${status}` };
  return { outcome:'unknown', payment, detail:`payment_status_${status || 'unknown'}` };
}

/**
 * Decide the outcome after a charge attempt.
 * @param {object} args
 * @param {object|null} args.payment  provider response when the charge call returned
 * @param {unknown} args.error        thrown error when the charge call failed
 * @param {(orderId:string)=>Promise<object>} args.lookup  GET payment by orderId
 * @param {string} args.orderId
 */
export async function resolveChargeOutcome({ payment = null, error = null, lookup, orderId }) {
  if (!error) {
    const classified = classifyPayment(payment);
    if (classified.outcome !== 'unknown') return classified;
  }
  let found;
  try {
    found = await lookup(orderId);
  } catch (lookupError) {
    if (isNotFound(lookupError) && error && isProviderRejection(error)) {
      return { outcome:'failed', detail:detailOf(error) };
    }
    return { outcome:'unknown', detail:`${PENDING_RECONCILE_PREFIX}${detailOf(error || lookupError)}` };
  }
  const classified = classifyPayment(found);
  if (classified.outcome === 'done') return classified;
  if (classified.outcome === 'failed') return classified;
  if (error && isProviderRejection(error) && !found?.status) return { outcome:'failed', detail:detailOf(error) };
  return { outcome:'unknown', payment:found, detail:`${PENDING_RECONCILE_PREFIX}${classified.detail}` };
}

export function cycleDateFromKey(cycleKey) {
  const value = String(cycleKey || '');
  return value.slice(value.lastIndexOf(':') + 1);
}

/**
 * Settle charge rows stuck in `processing`.
 * @param {object} cfg
 * @param {D1Database} cfg.db
 * @param {(orderId:string)=>Promise<object>} cfg.lookup
 * @param {string} cfg.chargeTable            e.g. billing_charge_events
 * @param {string} cfg.subscriptionTable      e.g. service_subscriptions
 * @param {string} cfg.chargeOwnerColumn      column on charge row pointing at the subscription
 * @param {string} cfg.subscriptionKeyColumn  matching key column on subscription table
 * @param {(value:string)=>string} cfg.addMonth
 * @param {Date} [cfg.now]
 */
export async function reconcileStaleCharges(cfg) {
  const { db, lookup, chargeTable, subscriptionTable, chargeOwnerColumn, subscriptionKeyColumn, addMonth } = cfg;
  const nowDate = cfg.now instanceof Date ? cfg.now : new Date();
  const now = nowDate.toISOString();
  const staleBefore = new Date(nowDate.getTime() - (cfg.staleAfterMs ?? STALE_PROCESSING_MS)).toISOString();
  const attentionBefore = new Date(nowDate.getTime() - (cfg.attentionAfterMs ?? ATTENTION_AFTER_MS)).toISOString();
  const rows = await db.prepare(`SELECT * FROM ${chargeTable} WHERE status='processing' AND created_at<=? ORDER BY created_at LIMIT 20`)
    .bind(staleBefore).all();

  const summary = { checked:0, settledDone:0, settledFailed:0, stillUnknown:0, needsAttention:[] };
  for (const row of rows.results || []) {
    summary.checked += 1;
    let found;
    let notFound = false;
    try {
      found = await lookup(row.order_id);
    } catch (error) {
      if (isNotFound(error)) notFound = true;
      else {
        summary.stillUnknown += 1;
        if (String(row.created_at) <= attentionBefore) summary.needsAttention.push({ orderId:row.order_id, cycleKey:row.cycle_key, reason:'lookup_unavailable' });
        continue;
      }
    }
    // After the stale window a missing payment means the request never reached the provider.
    const classified = notFound ? { outcome:'failed', detail:'provider_payment_not_found' } : classifyPayment(found);
    const owner = row[chargeOwnerColumn];

    if (classified.outcome === 'done') {
      const sub = await db.prepare(`SELECT next_billing_at FROM ${subscriptionTable} WHERE ${subscriptionKeyColumn}=?`).bind(owner).first();
      const statements = [
        db.prepare(`UPDATE ${chargeTable} SET status='done',provider_payment_key=?,detail=?,completed_at=? WHERE cycle_key=? AND status='processing'`)
          .bind(found?.paymentKey || '', 'reconciled_done', now, row.cycle_key),
      ];
      if (sub && String(sub.next_billing_at || '').slice(0, 10) === cycleDateFromKey(row.cycle_key)) {
        const next = addMonth(sub.next_billing_at);
        statements.push(db.prepare(`UPDATE ${subscriptionTable} SET status='active',current_period_start=?,current_period_end=?,next_billing_at=?,updated_at=? WHERE ${subscriptionKeyColumn}=?`)
          .bind(sub.next_billing_at, next, next, now, owner));
      }
      await db.batch(statements);
      summary.settledDone += 1;
    } else if (classified.outcome === 'failed') {
      await db.batch([
        db.prepare(`UPDATE ${chargeTable} SET status='failed',detail=?,completed_at=? WHERE cycle_key=? AND status='processing'`)
          .bind(`reconciled_${classified.detail}`.slice(0, 300), now, row.cycle_key),
        db.prepare(`UPDATE ${subscriptionTable} SET status='past_due',updated_at=? WHERE ${subscriptionKeyColumn}=? AND status='active'`)
          .bind(now, owner),
      ]);
      summary.settledFailed += 1;
    } else {
      summary.stillUnknown += 1;
      if (String(row.created_at) <= attentionBefore) summary.needsAttention.push({ orderId:row.order_id, cycleKey:row.cycle_key, reason:classified.detail });
    }
  }
  if (summary.needsAttention.length) {
    console.error('[billing-reconcile] charges need human attention', JSON.stringify({ table:chargeTable, items:summary.needsAttention }));
  }
  return summary;
}
