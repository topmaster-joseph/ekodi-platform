import { paymentProviderReadiness } from './payment-capabilities.js';

const SALE_TYPES = new Set(['direct','affiliate','inquiry']);
const RISK = Object.freeze({ green:'green', amber:'amber', red:'red' });

export function routeCommerceModel({ saleType = 'inquiry', env = {} } = {}) {
  const normalized = SALE_TYPES.has(saleType) ? saleType : 'inquiry';
  if (normalized === 'affiliate') {
    return {
      model: 'affiliate',
      transactionOwner: 'external-merchant',
      route: 'external-affiliate',
      paymentProvider: null,
      requiresEkodiPayment: false,
    };
  }
  if (normalized === 'inquiry') {
    return {
      model: 'inquiry',
      transactionOwner: 'seller',
      route: 'inquiry',
      paymentProvider: null,
      requiresEkodiPayment: false,
    };
  }
  const payment = paymentProviderReadiness(env);
  return {
    model: 'direct',
    transactionOwner: 'ekodi-order-engine',
    route: payment.executionMode === 'manual' ? 'manual-payment' : 'online-payment',
    paymentProvider: payment.id,
    requiresEkodiPayment: true,
    paymentReady: payment.liveReady,
  };
}
const ACTION_RISK = Object.freeze({
  'catalog.observe': RISK.green,
  'catalog.recommend': RISK.green,
  'content.prepare': RISK.green,
  'analytics.summarize': RISK.green,
  'order.prepare': RISK.amber,
  'supplier.outreach.prepare': RISK.amber,
  'settlement.prepare': RISK.amber,
  'payment.capture': RISK.red,
  'payment.refund': RISK.red,
  'payout.execute': RISK.red,
  'buyer_pii.release': RISK.red,
  'supplier.contract.accept': RISK.red,
});

export function classifyCommerceAction(action) {
  return ACTION_RISK[action] || RISK.amber;
}

export function commerceAutonomyPolicy() {
  return {
    green: { mode: 'auto-allowed', humanGate: false },
    amber: { mode: 'prepare-or-conditional', humanGate: false },
    red: { mode: 'human-gated', humanGate: true },
    actions: { ...ACTION_RISK },
  };
}

export function commandPlaneCapabilityContract() {
  return {
    service: 'ekodi-mall',
    namespace: 'commerce',
    addressMode: 'symbolic',
    operations: ['observe','diagnose','prepare','execute-low-risk','request-human-decision','verify','audit'],
    highImpactActions: Object.entries(ACTION_RISK).filter(([, risk]) => risk === RISK.red).map(([action]) => action),
  };
}