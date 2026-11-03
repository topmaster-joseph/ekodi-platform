import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MallCatalog, feeForFirstTouch, trustedSource } from './entry.js';

function healthTestDatabase() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/',import.meta.url);
  for (const name of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name,dir),'utf8'));
  return {
    close:()=>db.close(),
    prepare(sql) {
      let args=[];
      const statement={
        bind(...values) { args=values; return statement; },
        all:()=>({results:db.prepare(sql).all(...args)}),
        first:()=>db.prepare(sql).get(...args) || null,
        run:()=>db.prepare(sql).run(...args)
      };
      return statement;
    }
  };
}

test('canonical public health alias preserves the healthy schema, payment and safety projection', async () => {
  const {default:worker}=await import('./entry.js');
  const db=healthTestDatabase();
  try {
    const env={DB:db,ENVIRONMENT:'production',PAYMENT_PROVIDER:'toss',PAYMENTS_ENABLED:'true',DOMEMAE_API_KEY:'private-key-marker'};
    const original=await worker.fetch(new Request('https://ekodi.kr/health'),env);
    const canonical=await worker.fetch(new Request('https://ekodi.kr/api/public/health'),env);
    assert.equal(original.status,200);
    assert.equal(canonical.status,200);
    const body=await canonical.json();
    assert.deepEqual(body,await original.json());
    assert.equal(body.paymentsEnabled,true);
    assert.equal(body.domeggookAutoOrderReady,false);
    assert.equal(body.buyerPiiReleaseEnabled,false);
    assert.equal(body.supplierForwardEnabled,false);
    assert.equal(canonical.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(JSON.stringify(body),/private-key-marker/);
  } finally { db.close(); }
});

test('canonical public health returns unhealthy 503 without a database instead of a login response', async () => {
  const {default:worker}=await import('./entry.js');
  const response=await worker.fetch(new Request('https://ekodi.kr/api/public/health'),{});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.service,'ekodi-mall-api');
  assert.equal(body.ok,false);
  assert.equal(body.schemaReady,false);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('canonical public health retains origin enforcement', async () => {
  const {default:worker}=await import('./entry.js');
  const response=await worker.fetch(new Request('https://ekodi.kr/api/public/health',{headers:{origin:'https://untrusted.invalid'}}),{});
  assert.equal(response.status,403);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('canonical public health is GET-only and never delegates writes', async () => {
  const {default:worker}=await import('./entry.js');
  const env={DB:{prepare(){throw new Error('health method rejection must not touch D1');}}};
  for (const method of ['POST','PUT','DELETE','PATCH','HEAD']) {
    const response=await worker.fetch(new Request('https://ekodi.kr/api/public/health',{method}),env);
    assert.equal(response.status,405,method);
    assert.equal(response.headers.get('allow'),'GET');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

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

// EKODIPAY-CORE-001: EKODI Mall pays through MID q_ekodib62hb and never uses another merchant's keys.
test('mall health reports MID q_ekodib62hb and only *__MALL keys count as configured', async () => {
  const { default: worker } = await import('./entry.js');
  const health = async env => (await worker.fetch(new Request('https://ekodi.kr/health'), env)).json();
  const legacyOnly = await health({ PAYMENTS_ENABLED: 'false', PAYMENT_PROVIDER: 'toss', TOSS_CLIENT_KEY: 'test_ck_q', TOSS_SECRET_KEY: 'test_sk_q' });
  assert.deepEqual(legacyOnly.paymentMerchant, { profile: 'mall', mid: 'q_ekodib62hb', keyMode: { client: 'missing', secret: 'missing', widgetPair: false } });
  assert.equal(legacyOnly.tossSecretConfigured, false, 'QTIN/legacy keys must not activate mall payments');
  const mall = await health({ PAYMENTS_ENABLED: 'false', PAYMENT_PROVIDER: 'toss', TOSS_CLIENT_KEY__MALL: 'test_ck_m', TOSS_SECRET_KEY__MALL: 'test_sk_m' });
  assert.equal(mall.tossSecretConfigured, true);
  assert.equal(mall.paymentsEnabled, false);
  assert.deepEqual(mall.paymentMerchant.keyMode, { client: 'test', secret: 'test', widgetPair: false });
  // EKODI-MALL-KEY-MODE-001: live widget keys are reported as live without exposing values.
  const live = await health({ PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'toss', TOSS_CLIENT_KEY__MALL: 'live_gck_abcdef', TOSS_SECRET_KEY__MALL: 'live_gsk_secretvalue' });
  assert.deepEqual(live.paymentMerchant.keyMode, { client: 'live', secret: 'live', widgetPair: true });
  assert.doesNotMatch(JSON.stringify(live), /abcdef|secretvalue/);
});
