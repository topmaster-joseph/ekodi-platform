import { authorizeVerificationOperations } from './verification.js';
import { paymentProviderReadiness } from './payment-capabilities.js';
import { commerceAutonomyPolicy, commandPlaneCapabilityContract } from './commerce-os.js';
import { listCommerceEvents } from './commerce-events.js';

const PATH = '/api/internal/operations/cockpit';
const flag = (value) => String(value || '').toLowerCase() === 'true';
const nowIso = () => new Date().toISOString();

async function first(env, sql, bindings = []) {
  let statement = env.DB.prepare(sql);
  if (bindings.length) statement = statement.bind(...bindings);
  return statement.first();
}
async function scalar(env, sql, bindings = []) {
  const row = await first(env, sql, bindings);
  return Number(row?.count || 0);
}
async function money(env, sql, bindings = []) {
  const row = await first(env, sql, bindings);
  return Number(row?.amount || 0);
}

async function cockpit(env) {
  const payment = paymentProviderReadiness(env);
  const now = nowIso();
  const openVerification = await scalar(env, "SELECT COUNT(*) AS count FROM verification_requests WHERE status IN ('submitted','under_review')");
  const checkoutGateEnabled = await scalar(env, "SELECT COUNT(*) AS count FROM products WHERE status='published' AND checkout_ready=1");
  const paymentPending = await scalar(env, "SELECT COUNT(*) AS count FROM orders WHERE status='payment_pending'");
  const expiredPaymentPending = await scalar(env, "SELECT COUNT(*) AS count FROM orders WHERE status='payment_pending' AND expires_at<=?", [now]);
  const pendingSettlement = await scalar(env, "SELECT COUNT(*) AS count FROM settlement_ledger WHERE status='pending'");
  const pendingSettlementAmount = await money(env, "SELECT COALESCE(SUM(seller_amount),0) AS amount FROM settlement_ledger WHERE status='pending'");
  const exceptions = [];
  if (openVerification > 0) exceptions.push({ code:'verification-review', riskClass:'amber', humanGate:true, count:openVerification });
  if (expiredPaymentPending > 0) exceptions.push({ code:'expired-payment-pending', riskClass:'amber', humanGate:false, count:expiredPaymentPending });
  if (pendingSettlement > 0) exceptions.push({ code:'settlement-awaiting-review', riskClass:'amber', humanGate:true, count:pendingSettlement, amount:pendingSettlementAmount });
  if (checkoutGateEnabled > 0 && !payment.liveReady) exceptions.push({ code:'checkout-open-payment-blocked', riskClass:'amber', humanGate:true, count:checkoutGateEnabled, blockers:payment.blockers });
  if (flag(env.PAYMENTS_ENABLED) && !payment.liveReady) exceptions.push({ code:'payment-provider-not-ready', riskClass:'red', humanGate:true, blockers:payment.blockers });
  if (flag(env.BUYER_PII_RELEASE_ENABLED)) exceptions.push({ code:'buyer-pii-release-enabled', riskClass:'red', humanGate:true });
  if (flag(env.SUPPLIER_FORWARD_ENABLED)) exceptions.push({ code:'supplier-forward-enabled', riskClass:'red', humanGate:true });

  const latestEvents = await listCommerceEvents(env, { limit:25 });
  return {
    status:exceptions.some((item) => item.riskClass === 'red') ? 'attention' : exceptions.length ? 'review' : 'clear',
    generatedAt:now,
    payment,
    counters:{ openVerification, checkoutGateEnabled, paymentPending, expiredPaymentPending, pendingSettlement, pendingSettlementAmount },
    highImpact:{
      paymentsEnabled:flag(env.PAYMENTS_ENABLED),
      payoutExecutionEnabled:false,
      buyerPiiReleaseEnabled:flag(env.BUYER_PII_RELEASE_ENABLED),
      supplierForwardEnabled:flag(env.SUPPLIER_FORWARD_ENABLED),
      refundExecutionEnabled:false,
    },
    exceptions,
    latestEvents,
    autonomy:commerceAutonomyPolicy(),
    commandPlane:commandPlaneCapabilityContract(),
  };
}

export async function handleCommerceOperationsRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method !== 'GET') return { status:405, body:{ error:'METHOD_NOT_ALLOWED' } };
  if (!env.DB) return { status:503, body:{ error:'Mall database is not bound.' } };
  const auth = await authorizeVerificationOperations(request, env);
  if (!auth.ok) return { status:auth.status, body:{ error:auth.error } };
  return { status:200, body:{ cockpit:await cockpit(env), actor:auth.actor } };
}

export { cockpit as buildCommerceOperationsCockpit };
