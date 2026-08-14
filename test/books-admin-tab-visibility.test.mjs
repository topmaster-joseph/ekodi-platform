import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const featureSource = await readFile(new URL('../control-center-features.js', import.meta.url), 'utf8');
const financeSource = await readFile(new URL('../books-finance-admin.js', import.meta.url), 'utf8');
const distributionSource = await readFile(new URL('../books-distribution-admin.js', import.meta.url), 'utf8');
const pipelineSource = await readFile(new URL('../books-pipeline-admin.js', import.meta.url), 'utf8');
const royaltySource = await readFile(new URL('../books-royalty-admin.js', import.meta.url), 'utf8');

test('all requested Books operations have a visible tab source', () => {
  assert.match(featureSource, /tab\.textContent = 'Assets'/);
  assert.match(featureSource, /tab\.textContent = 'Governance'/);
  assert.match(financeSource, /tab\.textContent = 'Sales & Costs'/);
  assert.match(distributionSource, /tab\.textContent = 'Distribution'/);
  assert.match(pipelineSource, /tab\.textContent = 'Pipeline'/);
  assert.match(royaltySource, /tab\.textContent='Royalties'/);
});
