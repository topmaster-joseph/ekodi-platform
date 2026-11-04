// EKODI-MALL-DOMEGGOOK-GATES-001
// One fail-closed policy for customer-data handoff, paid supplier orders and
// supply-product checkout release. Read-only probes and catalog sync stay separate.
const enabled = (value) => String(value || '').toLowerCase() === 'true';

export function approvedMemberBindingReady(env) {
  const configured = String(env?.DOMEMAE_USER_ID || '').trim();
  const approved = String(env?.DOMEMAE_APPROVED_MEMBER_ID || '').trim();
  return Boolean(configured && approved && configured === approved);
}

export function supplierHandoffEnabled(env) {
  return enabled(env?.BUYER_PII_RELEASE_ENABLED) && enabled(env?.SUPPLIER_FORWARD_ENABLED);
}

function credentialsReady(env) {
  return Boolean(env?.DOMEMAE_API_KEY && env?.DOMEMAE_USER_ID && env?.DOMEMAE_PASSWORD)
    && approvedMemberBindingReady(env);
}

export function autoOrderEnabled(env) {
  return enabled(env?.DOMEGGOOK_AUTO_ORDER_ENABLED) && credentialsReady(env) && supplierHandoffEnabled(env);
}

export function pilotOrderIds(env) {
  return String(env?.DOMEGGOOK_PILOT_ORDER_IDS || '').split(',').map((v) => v.trim())
    .filter((v) => /^mall_[A-Za-z0-9_]{6,60}$/.test(v)).slice(0, 3);
}

// The current owner authorization is ONE supplier order costing at most 5,000 KRW
// including shipping. Unset, noninteger, or larger limits must fail closed.
export function pilotBudgetKrw(env) {
  const amount = Number(env?.DOMEGGOOK_PILOT_MAX_TOTAL_KRW || 0);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 5000 ? amount : 0;
}

// An allow-listed pilot is still a paid order, not an exemption from consent or forwarding controls.
export function pilotReady(env) {
  return pilotOrderIds(env).length === 1 && pilotBudgetKrw(env) > 0
    && credentialsReady(env) && supplierHandoffEnabled(env);
}
