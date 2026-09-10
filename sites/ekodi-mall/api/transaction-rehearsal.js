import { buildOrderQuote, createOrder, recordConfirmedPayment } from './worker.js';

const REHEARSAL_PATH = '/api/internal/rehearsal/transaction';
const clean = (value, max = 120) => String(value ?? '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, max);
const enabled = (env) => env?.ENVIRONMENT === 'staging' && String(env?.TRANSACTION_REHEARSAL_ENABLED || '').toLowerCase() === 'true';

function idsFor(runId) {
  const suffix = clean(runId, 48) || crypto.randomUUID().replaceAll('-', '').slice(0, 24);
  return {
    sellerId: `rehearsal-seller:${suffix}`,
    storeId: `rehearsal-store:${suffix}`,
    productId: `rehearsal-product:${suffix}`,
    shareCode: `REH${suffix.replace(/[^A-Za-z0-9]/g, '').slice(-28)}`,
    paymentKey: `rehearsal-payment:${suffix}`,
  };
}

async function cleanup(env, ids, orderId = '') {
  const statements = [];
  if (orderId) {
    statements.push(env.DB.prepare("DELETE FROM commerce_events WHERE aggregate_type='order' AND aggregate_id=?").bind(orderId));
    statements.push(env.DB.prepare('DELETE FROM settlement_ledger WHERE order_id=?').bind(orderId));
    statements.push(env.DB.prepare('DELETE FROM order_payments WHERE order_id=?').bind(orderId));
    statements.push(env.DB.prepare('DELETE FROM orders WHERE id=?').bind(orderId));
  }
  statements.push(env.DB.prepare('DELETE FROM products WHERE id=?').bind(ids.productId));
  statements.push(env.DB.prepare('DELETE FROM stores WHERE id=?').bind(ids.storeId));
  statements.push(env.DB.prepare('DELETE FROM memberships WHERE seller_id=?').bind(ids.sellerId));
  statements.push(env.DB.prepare('DELETE FROM seller_profiles WHERE user_id=?').bind(ids.sellerId));
  await env.DB.batch(statements);
}
async function seed(env, ids) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO seller_profiles
      (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(ids.sellerId, 'rehearsal@invalid.ekodi', 'EKODI Rehearsal Seller', 'business', 'google_verified', 'verified', now, now),
    env.DB.prepare(`INSERT INTO memberships
      (seller_id,plan_id,status,source,created_at,updated_at) VALUES (?,'free','active','transaction-rehearsal',?,?)`)
      .bind(ids.sellerId, now, now),
    env.DB.prepare(`INSERT INTO stores
      (id,seller_id,slug,name,contact,status,verification_status,created_at,updated_at)
      VALUES (?,?,?,?,?,'active','verified',?,?)`)
      .bind(ids.storeId, ids.sellerId, `reh-${ids.shareCode.toLowerCase()}`, 'EKODI Rehearsal Store', 'rehearsal@invalid.ekodi', now, now),
    env.DB.prepare(`INSERT INTO products
      (id,seller_id,store_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,contact,status,checkout_ready,created_at,updated_at,published_at)
      VALUES (?,?,?,?,?,?,'business','direct','general',?,12340,?,'published',1,?,?,?)`)
      .bind(ids.productId, ids.sellerId, ids.storeId, ids.shareCode,
        `https://ekodi.kr/ekodibiz/mall/p/${ids.shareCode}`, 'EKODI Rehearsal Seller', 'EKODI Transaction Rehearsal',
        'rehearsal@invalid.ekodi', now, now, now),
  ]);
}

function requireProof(condition, message) {
  if (!condition) throw new Error(`REHEARSAL_PROOF_FAILED:${message}`);
}
export async function handleTransactionRehearsal(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== REHEARSAL_PATH) return null;
  if (request.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!enabled(env)) return { status: 404, body: { error: 'NOT_FOUND' } };

  const expectedToken = String(env.TRANSACTION_REHEARSAL_TOKEN || '');
  const suppliedToken = String(request.headers.get('x-ekodi-rehearsal-token') || '');
  if (!expectedToken || suppliedToken !== expectedToken) return { status: 401, body: { error: 'REHEARSAL_AUTH_REQUIRED' } };
  if (!env.DB) return { status: 503, body: { error: 'STAGING_DB_REQUIRED' } };

  let body = {};
  try { body = await request.json(); } catch {}
  const ids = idsFor(body.runId);
  let orderId = '';
  let proof = null;
  try {
    await cleanup(env, ids);
    await seed(env, ids);

    const safety = await buildOrderQuote(env, { shareCode: ids.shareCode, quantity: 1 });
    requireProof(Boolean(safety.quote), 'safety-quote-missing');
    requireProof(safety.quote.checkoutReady === false, 'staging-safety-gate-open');
    requireProof(safety.quote.blockers.includes('payments-disabled'), 'payments-disabled-blocker-missing');

    const isolatedEnv = { ...env, PAYMENTS_ENABLED:'true', PAYMENT_PROVIDER:'toss', TOSS_SECRET_KEY:'rehearsal-no-network' };
    const created = await createOrder(isolatedEnv, { shareCode: ids.shareCode, quantity: 1 });
    requireProof(created.status === 201 && Boolean(created.order?.id), 'order-not-created');
    orderId = created.order.id;
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
    requireProof(Boolean(order), 'order-row-missing');
    const approvedAt = new Date().toISOString();
    const payment = {
      paymentKey: ids.paymentKey,
      orderId,
      status: 'DONE',
      method: 'REHEARSAL',
      totalAmount: order.gross_amount,
      approvedAt,
      requestedAt: approvedAt,
      type: 'NORMAL',
      mId: 'ekodi-rehearsal',
      cancels: [],
    };
    await recordConfirmedPayment(isolatedEnv, order, payment, 'REHEARSAL');
    await recordConfirmedPayment(isolatedEnv, order, payment, 'REHEARSAL');

    const paidOrder = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
    const paidPayment = await env.DB.prepare('SELECT * FROM order_payments WHERE order_id=?').bind(orderId).first();
    const settlement = await env.DB.prepare('SELECT * FROM settlement_ledger WHERE order_id=? AND entry_type=\'sale\'').bind(orderId).first();
    const settlementCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM settlement_ledger WHERE order_id=? AND entry_type=\'sale\'').bind(orderId).first();
    const commerceEvents = await env.DB.prepare("SELECT event_type AS eventType,COUNT(*) AS count FROM commerce_events WHERE aggregate_type='order' AND aggregate_id=? GROUP BY event_type").bind(orderId).all();
    const eventCounts = Object.fromEntries((commerceEvents.results || []).map((row) => [row.eventType, Number(row.count || 0)]));

    requireProof(paidOrder?.status === 'paid', 'order-not-paid');
    requireProof(paidPayment?.status === 'DONE' && paidPayment?.provider === 'REHEARSAL', 'payment-proof-invalid');
    requireProof(Number(settlementCount?.count) === 1, 'settlement-not-idempotent');
    requireProof(settlement?.status === 'pending', 'settlement-status-invalid');
    requireProof(Number(settlement?.gross_amount) === Number(paidOrder.gross_amount), 'settlement-gross-mismatch');
    requireProof(Number(settlement?.platform_fee_amount) === Number(paidOrder.platform_fee_amount), 'settlement-fee-mismatch');
    requireProof(Number(settlement?.seller_amount) === Number(paidOrder.seller_settlement_amount), 'settlement-seller-mismatch');
    requireProof(eventCounts['order.created'] === 1, 'order-event-not-idempotent');
    requireProof(eventCounts['payment.recorded'] === 1, 'payment-event-not-idempotent');
    requireProof(eventCounts['settlement.prepared'] === 1, 'settlement-event-not-idempotent');

    proof = {
      runId: clean(body.runId, 48) || 'generated',
      sellerType: 'business',
      storeVerified: true,
      checkoutGate: true,
      safetyGate: { checkoutReady: safety.quote.checkoutReady, blockers: safety.quote.blockers },
      order: { status: paidOrder.status, grossAmount: paidOrder.gross_amount, feeRatePercent: paidOrder.fee_rate_percent },
      payment: { provider: paidPayment.provider, status: paidPayment.status, totalAmount: paidPayment.total_amount },
      settlement: { status: settlement.status, count: Number(settlementCount.count), platformFeeAmount: settlement.platform_fee_amount, sellerAmount: settlement.seller_amount },
      commerceEvents: eventCounts,
      realPaymentExecuted: false,
      payoutExecuted: false,
      buyerPiiReleased: false,
    };
  } finally {
    await cleanup(env, ids, orderId);
  }

  return { status: 200, body: { ok: true, proof, cleanup: true } };
}

export function transactionRehearsalEnabled(env) {
  return enabled(env);
}
