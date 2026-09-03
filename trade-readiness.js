const REQUIRED_DOCUMENTS = Object.freeze([
  'commercial_invoice',
  'packing_list',
  'transport_document',
]);

const CONDITIONAL_DOCUMENTS = Object.freeze({
  fta: 'certificate_of_origin',
  regulated: 'compliance_evidence',
});

const SHIPMENT_STATES = Object.freeze([
  'draft',
  'quoted',
  'ordered',
  'production',
  'ready_to_ship',
  'in_transit',
  'customs',
  'released',
  'delivered',
  'closed',
  'cancelled',
]);

const NEXT_STATES = Object.freeze({
  draft: ['quoted', 'cancelled'],
  quoted: ['ordered', 'cancelled'],
  ordered: ['production', 'ready_to_ship', 'cancelled'],
  production: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['in_transit', 'cancelled'],
  in_transit: ['customs'],
  customs: ['released'],
  released: ['delivered'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
});

const MONEY_FIELDS = Object.freeze([
  'goods',
  'internationalFreight',
  'insurance',
  'duty',
  'importVat',
  'brokerage',
  'domesticFreight',
  'inspection',
  'other',
]);

function number(value, field) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new TypeError(`${field} must be a non-negative finite number`);
  return parsed;
}

function text(value) {
  return String(value ?? '').trim();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

export function createTradeCase(input = {}) {
  const id = text(input.id);
  const workspaceId = text(input.workspaceId);
  if (!id) throw new TypeError('id is required');
  if (!workspaceId) throw new TypeError('workspaceId is required');

  const state = text(input.state || 'draft');
  if (!SHIPMENT_STATES.includes(state)) throw new TypeError(`unsupported state: ${state}`);

  return Object.freeze({
    id,
    workspaceId,
    direction: input.direction === 'export' ? 'export' : 'import',
    state,
    supplierId: text(input.supplierId),
    buyerId: text(input.buyerId),
    incoterm: text(input.incoterm).toUpperCase(),
    currency: text(input.currency || 'USD').toUpperCase(),
    ftaClaimed: Boolean(input.ftaClaimed),
    regulated: Boolean(input.regulated),
    hsCode: text(input.hsCode),
    documents: uniq((input.documents || []).map(text)),
    certifications: uniq((input.certifications || []).map(text)),
    landedCost: calculateLandedCost(input.costs || {}),
    payment: Object.freeze({
      payable: number(input.payment?.payable, 'payment.payable'),
      paid: number(input.payment?.paid, 'payment.paid'),
      receivable: number(input.payment?.receivable, 'payment.receivable'),
      received: number(input.payment?.received, 'payment.received'),
    }),
    updatedAt: input.updatedAt || new Date().toISOString(),
  });
}

export function calculateLandedCost(costs = {}) {
  const normalized = Object.fromEntries(MONEY_FIELDS.map(field => [field, number(costs[field], `costs.${field}`)]));
  const total = MONEY_FIELDS.reduce((sum, field) => sum + normalized[field], 0);
  const customsBase = normalized.goods + normalized.internationalFreight + normalized.insurance;
  return Object.freeze({ ...normalized, customsBase, total });
}

export function missingTradeDocuments(tradeCase) {
  const required = [...REQUIRED_DOCUMENTS];
  if (tradeCase.ftaClaimed) required.push(CONDITIONAL_DOCUMENTS.fta);
  if (tradeCase.regulated) required.push(CONDITIONAL_DOCUMENTS.regulated);
  return required.filter(document => !tradeCase.documents.includes(document));
}

export function evaluateTradeReadiness(tradeCase) {
  const blockers = [];
  const warnings = [];
  const missingDocuments = missingTradeDocuments(tradeCase);

  if (!tradeCase.supplierId) blockers.push('supplier_missing');
  if (!tradeCase.buyerId) blockers.push('buyer_missing');
  if (!tradeCase.hsCode) blockers.push('hs_code_missing');
  if (!tradeCase.incoterm) blockers.push('incoterm_missing');
  if (missingDocuments.length) blockers.push('required_documents_missing');
  if (tradeCase.regulated && tradeCase.certifications.length === 0) blockers.push('certification_status_missing');

  if (tradeCase.ftaClaimed && !tradeCase.documents.includes(CONDITIONAL_DOCUMENTS.fta)) warnings.push('fta_benefit_unverified');
  if (tradeCase.landedCost.total === 0) warnings.push('landed_cost_not_estimated');
  if (tradeCase.payment.payable > tradeCase.payment.paid) warnings.push('supplier_payment_outstanding');
  if (tradeCase.payment.receivable > tradeCase.payment.received) warnings.push('buyer_receivable_outstanding');

  const score = Math.max(0, 100 - blockers.length * 20 - warnings.length * 5);
  return Object.freeze({
    ready: blockers.length === 0,
    score,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    missingDocuments: Object.freeze(missingDocuments),
    humanGates: Object.freeze(humanGatesFor(tradeCase)),
  });
}

export function humanGatesFor(tradeCase) {
  const gates = ['contract_acceptance', 'payment_release', 'customs_declaration_confirmation'];
  if (tradeCase.ftaClaimed) gates.push('origin_claim_confirmation');
  if (tradeCase.regulated) gates.push('regulatory_release_confirmation');
  return gates;
}

export function transitionTradeCase(tradeCase, nextState, context = {}) {
  const next = text(nextState);
  if (!SHIPMENT_STATES.includes(next)) throw new TypeError(`unsupported state: ${next}`);
  if (!(NEXT_STATES[tradeCase.state] || []).includes(next)) {
    throw new Error(`invalid trade transition: ${tradeCase.state} -> ${next}`);
  }

  const readiness = evaluateTradeReadiness(tradeCase);
  if (['in_transit', 'customs', 'released'].includes(next) && !readiness.ready) {
    throw new Error(`trade case is not ready: ${readiness.blockers.join(',')}`);
  }
  if (['ordered', 'in_transit', 'released'].includes(next) && context.humanApproved !== true) {
    throw new Error(`human approval required for transition to ${next}`);
  }

  return createTradeCase({ ...tradeCase, state: next, updatedAt: context.now || new Date().toISOString() });
}

export function tradeDashboardSummary(cases = []) {
  const summary = {
    total: cases.length,
    ready: 0,
    blocked: 0,
    inTransit: 0,
    customs: 0,
    receivableOutstanding: 0,
    payableOutstanding: 0,
    landedCostTotal: 0,
  };

  for (const tradeCase of cases) {
    const readiness = evaluateTradeReadiness(tradeCase);
    readiness.ready ? summary.ready++ : summary.blocked++;
    if (tradeCase.state === 'in_transit') summary.inTransit++;
    if (tradeCase.state === 'customs') summary.customs++;
    summary.receivableOutstanding += Math.max(0, tradeCase.payment.receivable - tradeCase.payment.received);
    summary.payableOutstanding += Math.max(0, tradeCase.payment.payable - tradeCase.payment.paid);
    summary.landedCostTotal += tradeCase.landedCost.total;
  }

  return Object.freeze(summary);
}

export const TRADE_READINESS_CONTRACT = Object.freeze({
  version: 1,
  requiredDocuments: REQUIRED_DOCUMENTS,
  conditionalDocuments: CONDITIONAL_DOCUMENTS,
  shipmentStates: SHIPMENT_STATES,
  moneyFields: MONEY_FIELDS,
  authority: 'tenant-scoped-human-gated',
  sourceOfTruth: 'trade-case-ledger',
});
