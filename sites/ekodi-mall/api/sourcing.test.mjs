import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SOURCING_PHASES, sourceDefaults, sourceExecution, computeSourceEconomics } from './sourcing.js';

test('sourcing rollout remains four gated phases', () => {
  assert.deepEqual(SOURCING_PHASES.map((item) => item.status), ['available','contract_required','dry_run','disabled_until_approved']);
});

test('general retail marketplace is reference-only and cannot receive buyer PII', () => {
  const source = sourceDefaults('retail_reference');
  assert.equal(source.fulfillmentMode, 'reference_only');
  assert.equal(source.rightsStatus, 'reference_only');
  assert.equal(source.orderPermission, 'none');
  assert.equal(source.piiPermission, 'none');
  assert.deepEqual(sourceExecution({ active: 1, stock_state: 'in_stock', fulfillment_mode: source.fulfillmentMode }), {
    mode: 'blocked', reason: 'reference-only-provider'
  });
});

test('affiliate source keeps checkout at external provider', () => {
  const source = sourceDefaults('affiliate');
  assert.equal(source.fulfillmentMode, 'external_affiliate');
  assert.equal(source.orderPermission, 'external_checkout');
  assert.equal(sourceExecution({ active: 1, stock_state: 'unknown', fulfillment_mode: source.fulfillmentMode }).mode, 'external_checkout');
});

test('new supplier source is never self-approved for dropship', () => {
  const source = sourceDefaults('contract_supplier');
  assert.equal(source.rightsStatus, 'contract_pending');
  assert.equal(source.orderPermission, 'none');
  assert.equal(source.piiPermission, 'none');
  const execution = sourceExecution({
    active: 1,
    stock_state: 'in_stock',
    fulfillment_mode: source.fulfillmentMode,
    rights_status: source.rightsStatus,
    order_permission: source.orderPermission,
    pii_permission: source.piiPermission
  });
  assert.equal(execution.mode, 'manual_review');
});

test('economics include EKODI fee before contribution margin', () => {
  const result = computeSourceEconomics({ saleAmount: 100000, costAmount: 70000, shippingAmount: 3000, feeRatePercent: 9 });
  assert.equal(result.platformFeeAmount, 9000);
  assert.equal(result.landedCost, 73000);
  assert.equal(result.contributionMargin, 18000);
  assert.equal(result.contributionMarginPercent, 18);
  assert.equal(result.economicallyEligible, true);
});

test('API order remains blocked unless both provider and environment gates are enabled', () => {
  const source = {
    active: 1,
    stock_state: 'in_stock',
    fulfillment_mode: 'supplier_dropship',
    rights_status: 'contract_verified',
    order_permission: 'api_approved',
    pii_permission: 'contracted_processor',
    provider_auto_order_enabled: 1
  };
  assert.equal(sourceExecution(source, {}).mode, 'manual_review');
  assert.equal(sourceExecution(source, { SOURCING_AUTO_ORDER_ENABLED: 'true' }).mode, 'api_order');
});

test('sourcing migration stores policy and decisions without copied retail catalog fields', async () => {
  const sql = await readFile(new URL('./migrations/0004_sourcing.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sourcing_providers/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sourcing_sources/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_source_links/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS procurement_decisions/);
  assert.match(sql, /auction-reference/);
  assert.match(sql, /reference_only/);
  assert.doesNotMatch(sql, /image_url|description_html|provider_product_title/i);
});
