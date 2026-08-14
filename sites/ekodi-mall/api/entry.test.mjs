import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MallCatalog, feeForFirstTouch, trustedSource } from './entry.js';

test('first-touch fee contract keeps personal 7/8/9 and verified business Store 10', () => {
  assert.equal(feeForFirstTouch({ sellerType:'individual', sourceType:'direct' }),7);
  assert.equal(feeForFirstTouch({ sellerType:'individual', sourceType:'marketplace' }),8);
  assert.equal(feeForFirstTouch({ sellerType:'individual', sourceType:'ai' }),9);
  assert.equal(feeForFirstTouch({ sellerType:'business', businessStoreVerified:true, sourceType:'direct' }),10);
  assert.equal(feeForFirstTouch({ sellerType:'business', businessStoreVerified:false, sourceType:'direct' }),7);
});

test('only server-resolved direct/AI sources are trusted', () => {
  assert.equal(trustedSource('direct'),'direct');
  assert.equal(trustedSource('ai'),'ai');
  assert.equal(trustedSource('marketplace'),'marketplace');
  assert.equal(trustedSource('direct-from-query'),'marketplace');
  assert.equal(trustedSource(''),'marketplace');
});

test('first-touch migration remains additive', async () => {
  const sql=await readFile(new URL('./migrations/0003_first_touch_attribution.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS attribution_visits/);
  assert.match(sql,/UNIQUE\(product_id, visitor_id\)/);
  assert.match(sql,/fee_rate_percent INTEGER NOT NULL CHECK \(fee_rate_percent IN \(7,8,9,10\)\)/);
});

test('verification migration follows fulfillment migration and remains additive', async () => {
  const fulfillment=await readFile(new URL('./migrations/0005_fulfillment_cycle.sql',import.meta.url),'utf8');
  const verification=await readFile(new URL('./migrations/0006_verification_readiness.sql',import.meta.url),'utf8');
  assert.match(fulfillment,/CREATE TABLE IF NOT EXISTS fulfillment_orders/);
  assert.match(verification,/CREATE TABLE IF NOT EXISTS verification_requests/);
  assert.match(verification,/CREATE TABLE IF NOT EXISTS mall_ops_audit/);
  assert.match(verification,/VERIFIED_SELLER_TYPE_LOCKED/);
});

test('entry composes official connector, discovery and supplier pilot before core delegation', async () => {
  const source=await readFile(new URL('./entry.js',import.meta.url),'utf8');
  assert.match(source,/import core from '\.\/worker\.js'/);
  assert.match(source,/handleDomemaeRequest/);
  assert.match(source,/domemaeConnectorReady/);
  assert.match(source,/domemaeOrderEnabled:false/);
  assert.match(source,/handleSupplierDiscoveryRequest/);
  assert.match(source,/supplierDiscoverySchemaReady/);
  assert.match(source,/handleFulfillmentRequest/);
  assert.match(source,/handleVerificationRequest/);
  assert.ok(source.indexOf('handleDomemaeRequest(request, env)') < source.indexOf('handleSupplierPilotRequest(request, env)'));
  assert.ok(source.indexOf('handleSupplierDiscoveryRequest(request, env)') < source.indexOf('handleSupplierPilotRequest(request, env)'));
  assert.match(source,/return core\.fetch\(request, env\)/);
  assert.match(source,/version:3/);
});

test('legacy MallCatalog Durable Object remains non-destructive', async () => {
  assert.equal(typeof MallCatalog,'function');
  const response=await new MallCatalog({},{}).fetch(new Request('https://legacy.invalid/'));
  assert.equal(response.status,410);
  assert.equal((await response.json()).error,'LEGACY_MALL_CATALOG_RETIRED');
  const config=await readFile(new URL('./wrangler.toml',import.meta.url),'utf8');
  assert.match(config,/\[exports\.MallCatalog\]/);
  assert.match(config,/storage\s*=\s*"sqlite"/);
  assert.doesNotMatch(config,/deleted_classes\s*=.*MallCatalog/);
});
