import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { supplierPartnerTransitionAllowed, supplierPartnerContractReady } from './supplier-pilot.js';

test('supplier partner lifecycle requires explicit staged transitions', () => {
  assert.equal(supplierPartnerTransitionAllowed('candidate','due_diligence'), true);
  assert.equal(supplierPartnerTransitionAllowed('candidate','active'), false);
  assert.equal(supplierPartnerTransitionAllowed('due_diligence','contracted'), true);
  assert.equal(supplierPartnerTransitionAllowed('contracted','pilot_ready'), true);
  assert.equal(supplierPartnerTransitionAllowed('pilot_ready','pilot_active'), true);
  assert.equal(supplierPartnerTransitionAllowed('pilot_active','active'), true);
  assert.equal(supplierPartnerTransitionAllowed('active','candidate'), false);
});

test('contract readiness requires business, master contract, pii, returns and cs references', () => {
  const complete = {
    businessVerificationRef: 'biz_ref_001', masterContractRef: 'contract_ref_001', piiProcessorRef: 'pii_contract_001',
    returnsPolicyRef: 'returns_ref_001', csPolicyRef: 'cs_ref_001'
  };
  assert.equal(supplierPartnerContractReady(complete), true);
  assert.equal(supplierPartnerContractReady({ ...complete, piiProcessorRef: '' }), false);
  assert.equal(supplierPartnerContractReady({ ...complete, returnsPolicyRef: '' }), false);
});

test('supplier partner migration keeps partner, source, sku, product mapping and audit ledgers separate', async () => {
  const sql = await readFile(new URL('./migrations/0007_supplier_partner_pilot.sql', import.meta.url), 'utf8');
  for (const table of ['supplier_partners','supplier_partner_sources','supplier_skus','supplier_sku_product_links','supplier_partner_events']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /auto_order_allowed INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(sql, /recipient_name|shipping_address|phone_number/i);
});

test('supplier pilot implementation never activates auto order or global pii release', async () => {
  const source = await readFile(new URL('./supplier-pilot.js', import.meta.url), 'utf8');
  assert.match(source, /autoOrderEnabled: false/);
  assert.match(source, /buyerPiiReleaseEnabled: false/);
  assert.doesNotMatch(source, /auto_order_allowed=1/);
});
