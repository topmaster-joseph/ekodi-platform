import test from 'node:test';
import assert from 'node:assert/strict';
import { FEE_POLICY, feeFor } from '../mall-api-worker.js';

test('individual Mall fees remain 7/8/9 with PG and VAT included', () => {
  assert.deepEqual(FEE_POLICY.individual, { direct: 7, marketplace: 8, ai: 9 });
  assert.equal(FEE_POLICY.pgIncluded, true);
  assert.equal(FEE_POLICY.vatIncluded, true);
  assert.equal(FEE_POLICY.proAiSubscriptionSeparate, true);
});

test('individual fee attribution is server-side 7/8/9', () => {
  assert.equal(feeFor('individual', 'direct', false), 7);
  assert.equal(feeFor('individual', 'marketplace', false), 8);
  assert.equal(feeFor('individual', 'ai', false), 9);
  assert.equal(feeFor('individual', 'unknown', false), 8);
});

test('verified business store policy remains a separate 10 percent contract', () => {
  assert.equal(feeFor('business', 'direct', true), 10);
  assert.equal(feeFor('business', 'marketplace', true), 10);
  assert.equal(feeFor('business', 'ai', true), 10);
});
