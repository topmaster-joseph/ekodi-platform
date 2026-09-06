import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-mall-production.yml', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8');

test('Mall production verifier follows the current storefront contract', () => {
  for (const marker of [
    'EKODI CONTEXT SHOPPING',
    'ALL MARKET',
    '/ekodibiz/mall/assets/context-curator.js',
    'data-ekodi-service="mall"',
    'https://ekodi.kr/ekodibiz/mall'
  ]) assert.ok(workflow.includes(marker), `missing current Mall verifier marker: ${marker}`);
  assert.doesNotMatch(workflow, /Seller Studio/);
  const mallGate = JSON.parse(manifest).worker.requests.find(request => request.url === 'https://ekodi.kr/ekodibiz/mall');
  assert.ok(mallGate?.expect?.includes('EKODI CONTEXT SHOPPING'));
  assert.ok(mallGate?.expect?.includes('data-ekodi-service="mall"'));
  assert.ok(mallGate?.rollbackExpect?.includes('EKODI CONTEXT SHOPPING'));
  assert.doesNotMatch(manifest, /ekodibizmall/);
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
  assert.match(workflow, /operations email allowlist is not configured/);
  assert.match(workflow, /high-impact transaction gate unexpectedly enabled/);
});

test('Mall production verifier checks the seller-neutral product identity catalog', () => {
  assert.match(workflow, /product_identity_v1/);
  assert.match(workflow, /productIdentities/);
  assert.match(workflow, /payload\.providers/);
  assert.match(workflow, /providerKey missing/);
  assert.match(workflow, /api\.ekodi\.kr\/api\/affiliate\/public\/products/);
  assert.match(workflow, /workflow_dispatch/);
});
