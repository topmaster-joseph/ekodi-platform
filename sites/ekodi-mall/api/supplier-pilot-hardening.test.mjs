import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('supplier pilot hardening locks provider type, manual-first pilot and auto order at DB layer', async () => {
  const sql = await readFile(new URL('./migrations/0008_supplier_pilot_hardening.sql', import.meta.url), 'utf8');
  assert.match(sql, /SUPPLIER_PARTNER_SOURCE_PROVIDER_MISMATCH/);
  assert.match(sql, /SUPPLIER_API_PILOT_REQUIRES_SEPARATE_READINESS/);
  assert.match(sql, /SUPPLIER_PARTNER_CONTRACT_REFS_REQUIRED/);
  assert.match(sql, /SUPPLIER_PARTNER_PILOT_READINESS_REQUIRED/);
  assert.match(sql, /SUPPLIER_PARTNER_PILOT_EVIDENCE_REQUIRED/);
  assert.match(sql, /SUPPLIER_AUTO_ORDER_LOCKED/);
  assert.match(sql, /NEW\.provider_type <> 'contract_supplier'/);
  assert.match(sql, /NEW\.auto_order_allowed <> 0/);
});

test('supplier pilot hardening does not add buyer delivery PII fields', async () => {
  const sql = await readFile(new URL('./migrations/0008_supplier_pilot_hardening.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /recipient_name|shipping_address|phone_number|buyer_address/i);
});
