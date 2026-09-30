const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const flag = (value) => String(value || '').toLowerCase() === 'true';

export const PAYMENT_PROVIDERS = Object.freeze({
  none: Object.freeze({
    id: 'none', label: 'Not configured', executionMode: 'disabled', adapterImplemented: false,
    capabilities: Object.freeze([]),
  }),
  toss: Object.freeze({
    id: 'toss', label: 'Toss Payments', executionMode: 'online', adapterImplemented: true,
    capabilities: Object.freeze(['server_confirm','idempotent_recording','reconciliation_metadata']),
  }),
  portone: Object.freeze({
    id: 'portone', label: 'PortOne V2', executionMode: 'online', adapterImplemented: false,
    capabilities: Object.freeze(['multi_pg','server_confirm','webhook','reconciliation']),
  }),
  manual_bank: Object.freeze({
    id: 'manual_bank', label: 'Manual bank transfer', executionMode: 'manual', adapterImplemented: false,
    capabilities: Object.freeze(['manual_confirmation','order_reference','reconciliation']),
  }),
});

export function normalizePaymentProvider(value) {
  const id = clean(value, 40).toLowerCase().replaceAll('-', '_');
  if (id === 'bank_transfer' || id === 'bank') return 'manual_bank';
  return Object.prototype.hasOwnProperty.call(PAYMENT_PROVIDERS, id) ? id : 'none';
}
export function selectedPaymentProvider(env = {}) {
  const explicit = clean(env.PAYMENT_PROVIDER, 40);
  if (explicit) return normalizePaymentProvider(explicit);
  if (env.TOSS_SECRET_KEY) return 'toss';
  return 'none';
}

function requiredConfig(providerId, env) {
  if (providerId === 'toss') return env.TOSS_SECRET_KEY ? [] : ['toss-secret-missing'];
  if (providerId === 'portone') {
    const blockers = [];
    if (!env.PORTONE_API_SECRET) blockers.push('portone-api-secret-missing');
    if (!env.PORTONE_STORE_ID) blockers.push('portone-store-id-missing');
    if (!env.PORTONE_CHANNEL_KEY) blockers.push('portone-channel-key-missing');
    return blockers;
  }
  if (providerId === 'manual_bank') {
    const blockers = [];
    if (!clean(env.MALL_BANK_ACCOUNT_REF, 500)) blockers.push('bank-account-ref-missing');
    if (!clean(env.MALL_MANUAL_PAYMENT_POLICY_REF, 500)) blockers.push('manual-payment-policy-ref-missing');
    return blockers;
  }
  return ['payment-provider-missing'];
}

export function paymentProviderReadiness(env = {}) {
  const raw = clean(env.PAYMENT_PROVIDER, 40);
  const id = selectedPaymentProvider(env);
  const provider = PAYMENT_PROVIDERS[id];
  const configBlockers = requiredConfig(id, env);
  const blockers = [...configBlockers];
  if (raw && id === 'none' && raw.toLowerCase() !== 'none') blockers.unshift('payment-provider-invalid');
  if (id !== 'none' && !provider.adapterImplemented) blockers.push('provider-adapter-not-implemented');
  const configured = id !== 'none' && configBlockers.length === 0;
  const activationReady = configured && provider.adapterImplemented && blockers.length === 0;
  const paymentsEnabled = flag(env.PAYMENTS_ENABLED);
  return {
    id,
    label: provider.label,
    executionMode: provider.executionMode,
    capabilities: [...provider.capabilities],
    adapterImplemented: provider.adapterImplemented,
    configured,
    activationReady,
    paymentsEnabled,
    liveReady: activationReady && paymentsEnabled,
    requiresHumanConfirmation: id === 'manual_bank',
    blockers: [...new Set(blockers)],
  };
}

export function paymentActivationBlockers(env = {}) {
  return [...paymentProviderReadiness(env).blockers];
}

export function paymentExecutionBlockers(env = {}) {
  const readiness = paymentProviderReadiness(env);
  const blockers = [...readiness.blockers];
  if (!readiness.paymentsEnabled) blockers.push('payments-disabled');
  return [...new Set(blockers)];
}
export function paymentProviderPublicView(env = {}) {
  const readiness = paymentProviderReadiness(env);
  return {
    id: readiness.id,
    label: readiness.label,
    executionMode: readiness.executionMode,
    capabilities: readiness.capabilities,
    adapterImplemented: readiness.adapterImplemented,
    configured: readiness.configured,
    activationReady: readiness.activationReady,
    paymentsEnabled: readiness.paymentsEnabled,
    liveReady: readiness.liveReady,
    requiresHumanConfirmation: readiness.requiresHumanConfirmation,
  };
}
