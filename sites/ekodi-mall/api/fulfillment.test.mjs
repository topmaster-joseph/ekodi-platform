import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  computeFulfillmentEconomics,
  fulfillmentTransitionAllowed,
  returnTransitionAllowed,
  validatePiiReleaseInput
} from './fulfillment.js';

test('fulfillment lifecycle only allows explicit operational transitions', () => {
  assert.equal(fulfillmentTransitionAllowed('awaiting_pii','ready_to_forward'), true);
  assert.equal(fulfillmentTransitionAllowed('ready_to_forward','forwarded'), true);
  assert.equal(fulfillmentTransitionAllowed('forwarded','accepted'), true);
  assert.equal(fulfillmentTransitionAllowed('accepted','shipped'), true);
  assert.equal(fulfillmentTransitionAllowed('shipped','delivered'), true);
  assert.equal(fulfillmentTransitionAllowed('delivered','return_requested'), true);
  assert.equal(fulfillmentTransitionAllowed('return_requested','delivered'), true);
  assert.equal(fulfillmentTransitionAllowed('awaiting_pii','shipped'), false);
  assert.equal(fulfillmentTransitionAllowed('closed','forwarded'), false);
});

test('return lifecycle cannot skip approval, receipt and refund states', () => {
  assert.equal(returnTransitionAllowed('requested','approved'), true);
  assert.equal(returnTransitionAllowed('approved','in_transit'), true);
  assert.equal(returnTransitionAllowed('in_transit','received'), true);
  assert.equal(returnTransitionAllowed('received','refund_pending'), true);
  assert.equal(returnTransitionAllowed('refund_pending','refunded'), true);
  assert.equal(returnTransitionAllowed('refunded','closed'), true);
  assert.equal(returnTransitionAllowed('requested','refunded'), false);
  assert.equal(returnTransitionAllowed('approved','refunded'), false);
});

test('PII release accepts opaque references and recursively rejects raw delivery fields', () => {
  assert.deepEqual(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234' }), { ok: true, ref: 'pii_Abcdefghijk_1234' });
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'short' }).ok, false);
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234', address: 'raw address' }).ok, false);
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234', delivery: { recipientName: '홍길동' } }).ok, false);
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234', metadata: [{ shippingAddress: 'raw address' }] }).ok, false);
});

test('actual-order economics recheck quantity, platform fee and per-unit minimum margin', () => {
  const eligible = computeFulfillmentEconomics({
    grossAmount: 100000,
    platformFeeAmount: 9000,
    quantity: 2,
    unitCost: 30000,
    shippingAmount: 3000,
    minMarginAmount: 5000,
    minMarginPercent: 10
  });
  assert.equal(eligible.supplierPayableAmount, 63000);
  assert.equal(eligible.contributionMargin, 28000);
  assert.equal(eligible.requiredMarginAmount, 10000);
  assert.equal(eligible.economicallyEligible, true);

  const blocked = computeFulfillmentEconomics({
    grossAmount: 100000,
    platformFeeAmount: 9000,
    quantity: 2,
    unitCost: 42000,
    shippingAmount: 3000,
    minMarginAmount: 5000,
    minMarginPercent: 10
  });
  assert.equal(blocked.contributionMargin, 4000);
  assert.equal(blocked.economicallyEligible, false);
});

test('fulfillment migration keeps contract, shipment, return, supplier settlement and audit ledgers separate', async () => {
  const sql = await readFile(new URL('./migrations/0005_fulfillment_cycle.sql', import.meta.url), 'utf8');
  for (const table of ['supplier_contracts','fulfillment_orders','fulfillment_shipments','fulfillment_returns','supplier_settlement_ledger','fulfillment_events']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /pii_release_ref TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(sql, /recipient_name|shipping_address|phone_number/i);
});

test('manual forwarding remains behind explicit environment gates and does not execute payout/refund', async () => {
  const source = await readFile(new URL('./fulfillment.js', import.meta.url), 'utf8');
  assert.match(source, /BUYER_PII_RELEASE_ENABLED/);
  assert.match(source, /SUPPLIER_FORWARD_ENABLED/);
  assert.match(source, /supplierPayoutExecutionEnabled: false/);
  assert.match(source, /refundExecutionEnabled: false/);
  assert.match(source, /실제 주문금액·수수료·수량 기준/);
});
