import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [providers, commerceOs, events, operations, worker, verification, entry, migration, wrangler, siteText, deploy, productionVerifier] = await Promise.all([
  readFile(new URL('../sites/ekodi-mall/api/payment-capabilities.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/commerce-os.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/commerce-events.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/commerce-operations.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/verification.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/entry.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/migrations/0014_commerce_os_events.sql', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/api/wrangler.toml', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/content/site.json', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-ekodi-mall.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/verify-ekodi-mall-production.yml', import.meta.url), 'utf8')
]);
const site = JSON.parse(siteText);

test('Commerce OS makes payment providers replaceable without enabling money movement', () => {
  for (const provider of ['none', 'toss', 'portone', 'manual_bank']) assert.ok(providers.includes(`${provider}:`));
  assert.ok(providers.includes('adapterImplemented: false'));
  assert.ok(providers.includes('provider-adapter-not-implemented'));
  assert.match(wrangler, /PAYMENT_PROVIDER = "toss"/);
  assert.match(wrangler, /PAYMENTS_ENABLED = "false"/);
  assert.equal(site.commerce.paymentProviderAuthority, 'server-capability-registry');
  assert.equal(site.commerce.highImpactExecution, 'human-gated');
});

test('unimplemented PortOne and manual-bank capabilities have no live execution path', () => {
  assert.ok(providers.includes("id: 'portone'"));
  assert.ok(providers.includes("id: 'manual_bank'"));
  assert.ok(worker.includes("if (provider !== 'toss')"));
  assert.ok(worker.includes('confirmTossPayment'));
  assert.doesNotMatch(worker, /confirmPortOne|confirmManualBank|capturePortOne|approveBankTransfer/);
  assert.doesNotMatch(operations, /method === 'POST'|request\.method === 'POST'/);
  assert.ok(verification.includes('paymentActivationBlockers'));
  assert.ok(verification.includes('paymentExecutionBlockers'));
});

test('Commerce Event Ledger is append-oriented, idempotent and atomic with order state', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS commerce_events/);
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /risk_class TEXT NOT NULL CHECK/);
  assert.ok(events.includes('INSERT OR IGNORE INTO commerce_events'));
  assert.ok(events.includes('commerceEventStatement'));
  assert.ok(worker.includes('env.DB.batch([orderInsert, orderEvent.statement])'));
  assert.ok(worker.includes("eventType:'payment.recorded'"));
  assert.ok(worker.includes("eventType:'settlement.prepared'"));
  assert.doesNotMatch(events, /DELETE FROM commerce_events|UPDATE commerce_events/);
});

test('Commerce OS delegates orchestration to the v8 Command Plane without transferring authority', () => {
  assert.ok(commerceOs.includes("addressMode: 'symbolic'"));
  assert.ok(commerceOs.includes("service: 'ekodi-mall'"));
  assert.ok(commerceOs.includes("namespace: 'commerce'"));
  for (const action of ['payment.capture', 'payment.refund', 'payout.execute', 'buyer_pii.release', 'supplier.contract.accept']) {
    assert.ok(commerceOs.includes(`'${action}': RISK.red`));
  }
  assert.ok(commerceOs.includes("red: { mode: 'human-gated', humanGate: true }"));
  assert.doesNotMatch(commerceOs, /admin\.ekodi\.kr|my\.ekodi\.kr|TOSS_SECRET_KEY/);
});

test('Operations Cockpit is read-only, authenticated and does not expose financial execution', () => {
  assert.ok(operations.includes("const PATH = '/api/internal/operations/cockpit'"));
  assert.ok(operations.includes('authorizeVerificationOperations'));
  assert.ok(operations.includes("request.method !== 'GET'"));
  assert.ok(operations.includes('payoutExecutionEnabled:false'));
  assert.ok(operations.includes('refundExecutionEnabled:false'));
  assert.ok(entry.includes('handleCommerceOperationsRequest'));
  assert.ok(deploy.includes('cockpit_code'));
  assert.ok(productionVerifier.includes('commerceCockpitAuthBoundary=verified'));
});

test('staging and production gates prove Commerce OS without opening high-impact execution', () => {
  for (const marker of [
    'commerceEventSchemaReady',
    'commerceOsVersion',
    'PAYMENT_PROVIDER = "toss"',
    "body.proof?.commerceEvents?.[key] !== 1",
    '/api/internal/operations/cockpit'
  ]) assert.ok(deploy.includes(marker), `missing Mall deploy contract: ${marker}`);
  assert.ok(productionVerifier.includes('paymentProvider?.id'));
  assert.ok(productionVerifier.includes('adapterImplemented'));
  for (const flag of ['paymentsEnabled', 'payoutExecutionEnabled', 'buyerPiiReleaseEnabled', 'supplierForwardEnabled', 'refundExecutionEnabled']) {
    assert.ok(productionVerifier.includes(flag));
  }
});
