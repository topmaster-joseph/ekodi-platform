import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readEvolutionKernelSources,
  validateEvolutionKernelContract,
} from '../scripts/validate-evolution-kernel.mjs';

test('Generation 10 Evolution Kernel contracts remain coherent and enforced', async () => {
  const sources = await readEvolutionKernelSources();
  const result = validateEvolutionKernelContract(sources);
  assert.deepEqual(result.errors, []);
  assert.equal(result.generation, 10);
  assert.equal(result.kernelAreaCount, 10);
  assert.ok(result.resourceCount >= 8);
});

test('Evolution Kernel rejects unsafe authority or automatic promotion drift', async () => {
  const sources = await readEvolutionKernelSources();
  const unsafe = structuredClone(sources);
  unsafe.kernel.invariants.humanFinalAuthorityPreserved = false;
  unsafe.kernel.promotion.automaticGenerationPromotion = true;
  const result = validateEvolutionKernelContract(unsafe);
  assert.ok(result.errors.some(error => error.includes('Human final authority')));
  assert.ok(result.errors.some(error => error.includes('Automatic generation promotion')));
});
