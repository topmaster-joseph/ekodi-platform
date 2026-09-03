import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLandedCost,
  createTradeCase,
  evaluateTradeReadiness,
  tradeDashboardSummary,
  transitionTradeCase,
} from '../trade-readiness.js';

const readyCase = overrides => createTradeCase({
  id: 'trade-jixing-001',
  workspaceId: 'workspace-ekodibiz',
  supplierId: 'supplier-jixing-harbin',
  buyerId: 'buyer-kr-001',
  incoterm: 'FOB',
  hsCode: '8516.80',
  documents: ['commercial_invoice', 'packing_list', 'transport_document'],
  costs: { goods: 10000, internationalFreight: 800, insurance: 100, duty: 500, importVat: 1140, brokerage: 200, domesticFreight: 150 },
  payment: { payable: 10900, paid: 10900, receivable: 15000, received: 5000 },
  ...overrides,
});

test('landed cost keeps customs base separate from total operating landed cost', () => {
  const cost = calculateLandedCost({ goods: 100, internationalFreight: 10, insurance: 2, duty: 5, importVat: 11.7, brokerage: 3 });
  assert.equal(cost.customsBase, 112);
  assert.equal(cost.total, 131.7);
});

test('readiness blocks shipment when core trade evidence is missing', () => {
  const tradeCase = createTradeCase({ id: 't1', workspaceId: 'w1' });
  const result = evaluateTradeReadiness(tradeCase);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes('supplier_missing'));
  assert.ok(result.blockers.includes('buyer_missing'));
  assert.ok(result.blockers.includes('hs_code_missing'));
  assert.ok(result.blockers.includes('incoterm_missing'));
  assert.ok(result.blockers.includes('required_documents_missing'));
});

test('FTA and regulated imports require origin and compliance evidence', () => {
  const tradeCase = readyCase({ ftaClaimed: true, regulated: true });
  const result = evaluateTradeReadiness(tradeCase);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingDocuments, ['certificate_of_origin', 'compliance_evidence']);
  assert.ok(result.humanGates.includes('origin_claim_confirmation'));
  assert.ok(result.humanGates.includes('regulatory_release_confirmation'));
});

test('financial or customs-sensitive transitions require human approval', () => {
  const tradeCase = readyCase({ state: 'quoted' });
  assert.throws(() => transitionTradeCase(tradeCase, 'ordered'), /human approval required/);
  const ordered = transitionTradeCase(tradeCase, 'ordered', { humanApproved: true, now: '2026-09-02T21:00:00.000Z' });
  assert.equal(ordered.state, 'ordered');
});

test('a blocked case cannot advance to international shipment', () => {
  const tradeCase = createTradeCase({ id: 't2', workspaceId: 'w1', state: 'ready_to_ship' });
  assert.throws(() => transitionTradeCase(tradeCase, 'in_transit', { humanApproved: true }), /not ready/);
});

test('dashboard exposes shipment and cash exposure without mixing tenant authority', () => {
  const cases = [
    readyCase({ state: 'in_transit' }),
    readyCase({ id: 'trade-002', state: 'customs', payment: { payable: 1000, paid: 400, receivable: 3000, received: 1000 } }),
  ];
  const summary = tradeDashboardSummary(cases);
  assert.equal(summary.total, 2);
  assert.equal(summary.ready, 2);
  assert.equal(summary.inTransit, 1);
  assert.equal(summary.customs, 1);
  assert.equal(summary.payableOutstanding, 600);
  assert.equal(summary.receivableOutstanding, 12000);
});
