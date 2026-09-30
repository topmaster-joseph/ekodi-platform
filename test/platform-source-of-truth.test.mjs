import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlatformSourceOfTruth } from '../scripts/validate-platform-source-of-truth.mjs';

test('canonical source of truth is internally consistent', async () => {
  const result = await validatePlatformSourceOfTruth();
  assert.equal(result.ok, true, result.errors.join(', '));
  assert.equal(result.generation, 10);
  assert.equal(result.scaleTier, 'S0');
  assert.deepEqual(result.errors, []);
});

test('legacy descriptive documentation cannot fail canonical authority validation', async () => {
  const result = await validatePlatformSourceOfTruth();
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.warnings));
});
