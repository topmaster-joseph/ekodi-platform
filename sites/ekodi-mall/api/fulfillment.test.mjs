import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fulfillmentTransitionAllowed, validatePiiReleaseInput } from './fulfillment.js';

test('fulfillment lifecycle only allows explicit operational transitions', () => {
  assert.equal(fulfillmentTransitionAllowed('awaiting_pii','ready_to_forward'), true);
  assert.equal(fulfillmentTransitionAllowed('ready_to_forward','forwarded'), true);
  assert.equal(fulfillmentTransitionAllowed('forwarded','accepted'), true);
  assert.equal(fulfillmentTransitionAllowed('accepted','shipped'), true);
  assert.equal(fulfillmentTransitionAllowed('shipped','delivered'), true);
  assert.equal(fulfillmentTransitionAllowed('delivered','return_requested'), true);
  assert.equal(fulfillmentTransitionAllowed('awaiting_pii','shipped'), false);
  assert.equal(fulfillmentTransitionAllowed('closed','forwarded'), false);
});

test('PII release accepts opaque references and rejects raw delivery fields', () => {
  assert.deepEqual(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234' }), { ok: true, ref: 'pii_Abcdefghijk_1234' });
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'short' }).ok, false);
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234', address: 'raw address' }).ok, false);
  assert.equal(validatePiiReleaseInput({ piiReleaseRef: 'pii_Abcdefghijk_1234', phone: '010...' }).ok, false);
});

test('fulfillment migration keeps contract, shipment, return, supplier settlement and audit ledgers separate', async () => {
  const sql = await readFile(new URL('./migrations/0005_fulfillment_cycle.sql', import.meta.url), 'utf8');
  for (const table of ['supplier_contracts','fulfillment_orders','fulfillment_shipments','fulfillment_returns','supplier_settlement_ledger','fulfillment_events']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /pii_release_ref TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(sql, /recipient_name|shipping_address|phone_number/i);
});

test('manual forwarding remains behind explicit environment gates', async () => {
  const source = await readFile(new URL('./fulfillment.js', import.meta.url), 'utf8');
  assert.match(source, /BUYER_PII_RELEASE_ENABLED/);
  assert.match(source, /SUPPLIER_FORWARD_ENABLED/);
  assert.match(source, /supplierPayoutExecutionEnabled: false/);
  assert.match(source, /refundExecutionEnabled: false/);
});
