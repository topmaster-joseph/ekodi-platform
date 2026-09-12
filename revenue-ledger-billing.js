import { ensureRevenueLedger, recordProviderRevenue } from './revenue-ledger-d1.js';

const text = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export function billingChargeRevenueInput(row = {}) {
  const id = Number(row.id || 0);
  const externalRef = text(row.provider_payment_key, 220)
    || text(row.order_id, 220)
    || (id > 0 ? `billing-charge:${id}` : '');
  if (!externalRef) throw new TypeError('billing charge reference is required');
  const subjectType = text(row.subject_type, 40).toLowerCase();
  const subjectKey = text(row.subject_key, 180);
  return {
    provider: 'toss',
    externalRef,
    source: 'subscription',
    amount: Number(row.amount || 0),
    currency: 'KRW',
    confirmed: true,
    tenantKey: subjectType === 'tenant' ? subjectKey : '',
    siteKey: text(row.site, 120),
    subjectType,
    subjectKey,
    occurredAt: row.completed_at || row.created_at || new Date().toISOString(),
    metadata: {
      billingChargeId: id || null,
      subscriptionId: Number(row.subscription_id || 0) || null,
      cycleKey: text(row.cycle_key, 220),
      orderId: text(row.order_id, 220),
      planId: text(row.plan_id, 80),
      providerFeeAccounting: 'separate_expense',
    },
  };
}

export async function reconcileBillingRevenue(db, { limit = 100 } = {}) {
  await ensureRevenueLedger(db);
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 100)));
  const found = await db.prepare(`SELECT
      c.id,c.subscription_id,c.cycle_key,c.order_id,c.amount,c.provider_payment_key,c.created_at,c.completed_at,
      s.subject_type,s.subject_key,s.site,s.plan_id
    FROM billing_charge_events c
    JOIN service_subscriptions s ON s.id=c.subscription_id
    LEFT JOIN realized_revenue_events r
      ON r.provider='toss'
      AND r.external_ref=COALESCE(NULLIF(c.provider_payment_key,''),NULLIF(c.order_id,''),'billing-charge:' || c.id)
    WHERE c.status='done' AND r.id IS NULL
    ORDER BY c.id ASC
    LIMIT ?`).bind(safeLimit).all();
  const rows = found.results || [];
  let recorded = 0;
  for (const row of rows) {
    await recordProviderRevenue(db, billingChargeRevenueInput(row));
    recorded += 1;
  }
  return { scanned:rows.length, recorded, limit:safeLimit, hasMore:rows.length === safeLimit };
}

export async function reconcileBillingRevenueBestEffort(db, options = {}) {
  try {
    return { ok:true, ...(await reconcileBillingRevenue(db, options)) };
  } catch (error) {
    console.error('[EKODI][REVENUE_LEDGER_RECONCILE_FAILED]', error);
    return { ok:false, scanned:0, recorded:0, error:String(error?.message || error).slice(0,300) };
  }
}
