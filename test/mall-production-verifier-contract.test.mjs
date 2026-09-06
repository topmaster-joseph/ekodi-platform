import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-mall-production.yml', import.meta.url), 'utf8');
const manifestText = await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestText);

test('Mall production verifier follows stable route and storefront structure', () => {
  for (const header of [
    'x-ekodi-route: public-ekodi-mall',
    'x-ekodi-edge: mall-path-gateway',
    'x-ekodi-service: mall',
    'x-ekodi-surface: public'
  ]) assert.ok(workflow.includes(header), `missing route header contract: ${header}`);
  assert.ok(workflow.includes('-D /tmp/mall.headers'));
  assert.ok(workflow.includes('grep -Fiq "$header" /tmp/mall.headers'));

  for (const marker of [
    'data-ekodi-service="mall"',
    'data-ekodi-user-surface="public"',
    'rel="canonical" href="https://ekodi.kr/ekodibiz/mall/',
    '/ekodibiz/mall/assets/marketplace-live.js',
    '/ekodibiz/mall/seller/'
  ]) assert.ok(workflow.includes(marker), `missing structural contract: ${marker}`);
  assert.doesNotMatch(workflow, /GIFT CONTEXT INTELLIGENCE|CONNECTED COMMERCE|OUR PROMISE|EKODI CONTEXT SHOPPING|ALL MARKET/);
});

test('shared-site Mall release gate uses the same stable ownership contract', () => {
  const mallGate = manifest.worker.requests.find(request => request.url === 'https://ekodi.kr/ekodibiz/mall');  assert.ok(mallGate);
  for (const marker of [
    'data-ekodi-service="mall"',
    'data-ekodi-user-surface="public"',
    '/ekodibiz/mall/assets/marketplace-live.js'
  ]) {
    assert.ok(mallGate.expect?.includes(marker), `missing release marker: ${marker}`);
    assert.ok(mallGate.rollbackExpect?.includes(marker), `missing rollback marker: ${marker}`);
  }
  assert.ok(mallGate.headerExpect?.includes('x-ekodi-route: public-ekodi-mall'));
  assert.ok(mallGate.headerExpect?.includes('x-ekodi-edge: mall-path-gateway'));
  assert.doesNotMatch(manifestText, /EKODI CONTEXT SHOPPING|GIFT CONTEXT INTELLIGENCE|CONNECTED COMMERCE|OUR PROMISE/);
});

test('Mall production verifier checks the server transaction safety boundary', () => {
  assert.match(workflow, /https:\/\/mall-api\.ekodi\.kr\/health/);
  for (const field of [
    'schemaReady',
    'orderSchemaReady',
    'verificationSchemaReady',
    'operationsReviewConfigured',
    'operationsEmailAllowlistConfigured',
    'paymentsEnabled',
    'payoutExecutionEnabled',
    'buyerPiiReleaseEnabled',
    'supplierForwardEnabled',
    'refundExecutionEnabled'
  ]) assert.match(workflow, new RegExp(field));
  assert.match(workflow, /operations review is not configured/);
  assert.match(workflow, /operations email allowlist is not configured/);  assert.match(workflow, /high-impact transaction gate unexpectedly enabled/);
});

test('Mall production verifier preserves Verification Ops cache safety checks', () => {
  assert.match(workflow, /verification-ops/);
  assert.match(workflow, /cache-control: no-store/);
  assert.match(workflow, /x-robots-tag: noindex, nofollow, noarchive/);
  assert.match(workflow, /verificationOpsCacheBoundary=verified/);
});

test('Mall production verifier checks the seller-neutral product identity catalog', () => {
  assert.match(workflow, /product_identity_v1/);
  assert.match(workflow, /productIdentities/);
  assert.match(workflow, /payload\.providers/);
  assert.match(workflow, /providerKey missing/);
  assert.match(workflow, /api\.ekodi\.kr\/api\/affiliate\/public\/products/);
  assert.match(workflow, /workflow_dispatch/);
});
