import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('marketing-order-connectors.js', 'utf8');
const migration = fs.readFileSync('migrations/0025_marketing_store_connectors.sql', 'utf8');
const entry = fs.readFileSync('mission-control-entry-worker.js', 'utf8');
const security = fs.readFileSync('security-edge.js', 'utf8');

const stores = {
  jadam: '4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa',
  pizzamaru: '6b1b6ae0-8641-4ee1-8e6a-7cb6019fab27',
  yogurtpurple: '43ef7c9c-5932-46b9-b31e-4ab4ee6a60ce',
};

const providers = ['supabase_orders', 'pos_bridge', 'baemin', 'coupang_eats', 'yogiyo'];

test('three Mokpo University stores are independent connector scopes', () => {
  for (const storeId of Object.values(stores)) {
    assert.ok(migration.includes(storeId), `missing store scope ${storeId}`);
  }
  assert.match(migration, /marketing_data_connectors/);
  assert.match(migration, /UNIQUE\(workspace_type, workspace_key, provider\)/);
  for (const provider of providers) assert.ok(migration.includes(`'${provider}'`), `missing provider ${provider}`);
});

test('PizzaMaru and YogurtPurple receive food B2C CRM templates', () => {
  assert.match(migration, new RegExp(`'store','${stores.pizzamaru}'.*?'food_b2c'`, 's'));
  assert.match(migration, new RegExp(`'store','${stores.yogurtpurple}'.*?'food_b2c'`, 's'));
  assert.match(migration, /repeat_order/);
  assert.match(migration, /reactivated/);
});

test('owned-order sync reads completed orders only and preserves source RLS', () => {
  assert.ok(runtime.includes("params.set('status','eq.completed')"));
  assert.ok(runtime.includes('authorization:`Bearer ${ctx.who.token}`'));
  assert.ok(runtime.includes('store_id',));
  assert.ok(runtime.includes('INSERT OR IGNORE INTO marketing_events'));
  assert.ok(runtime.includes('supabase:${String(order?.id'));
});

test('connector runtime never persists raw customer names and pseudonymizes customer reference', () => {
  assert.ok(!runtime.includes('customer_name'));
  assert.match(runtime, /customerKey\(/);
  assert.match(runtime, /identity_salt/);
  assert.match(runtime, /SHA-256/);
  assert.match(runtime, /rawCustomerIdentityStored:false/);
  assert.match(runtime, /externalWriteBack:false/);
  assert.match(migration, /Credentials\/tokens are intentionally NOT stored here/);
});

test('bridge pairing stores only a one-way key hash and bridge ingestion is import-only', () => {
  assert.match(runtime, /bridge_key_hash/);
  assert.match(runtime, /await sha256\(token\)/);
  assert.ok(!migration.includes('bridge_key TEXT'));
  assert.match(migration, /mode TEXT NOT NULL DEFAULT 'read_only' CHECK\(mode IN \('read_only','import_only'\)\)/);
  assert.match(runtime, /x-ekodi-bridge-key/);
  assert.match(runtime, /orders\.slice\(0,100\)/);
});

test('connector API is routed through the guarded control worker and rate limited', () => {
  assert.match(entry, /handleMarketingOrderConnectors/);
  assert.match(entry, /path\.startsWith\('\/api\/marketing\/connectors\/'\)/);
  assert.match(security, /path\.startsWith\('\/api\/marketing\/connectors\/'\)/);
  for (const path of [
    '/api/marketing/connectors/status',
    '/api/marketing/connectors/supabase-orders/sync',
    '/api/marketing/connectors/bridge/pair',
    '/api/marketing/connectors/bridge/ingest',
  ]) assert.ok(runtime.includes(path), `missing route ${path}`);
});
