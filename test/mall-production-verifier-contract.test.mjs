import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-mall-production.yml', import.meta.url), 'utf8');

test('Mall production verifier follows the current Context Shopping contract', () => {
  for (const marker of [
    'EKODI CONTEXT SHOPPING',
    '상품보다 이유부터',
    '추천순위는 제휴수수료와 분리합니다',
    'ALL MARKET',
    'Seller Studio',
    '검증된 경로만 활성화'
  ]) assert.match(workflow, new RegExp(marker));
  assert.doesNotMatch(workflow, /SMART SHOPPING/);
  assert.doesNotMatch(workflow, /오늘 필요한 것,/);
  assert.doesNotMatch(workflow, /오늘의 상품/);
});

test('Mall production verifier checks the server transaction safety boundary', () => {
  assert.match(workflow, /https:\/\/mall-api\.ekodi\.kr\/health/);
  for (const field of [
    'schemaReady',
    'orderSchemaReady',
    'verificationSchemaReady',
    'paymentsEnabled',
    'payoutExecutionEnabled',
    'buyerPiiReleaseEnabled',
    'supplierForwardEnabled',
    'refundExecutionEnabled'
  ]) assert.match(workflow, new RegExp(field));
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