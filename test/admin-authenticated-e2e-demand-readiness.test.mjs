import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E activates only the target demand menu before contextual navigation', () => {
  assert.doesNotMatch(source, /stage\('ready-demand'\)/);
  assert.match(source, /async function prepareTargetDemand\(\)/);
  assert.match(source, /\[data-demand-feature\]\[data-section=/);
  assert.match(source, /await clickFast\(placeholder\)/);
  assert.match(source, /!target\.hasAttribute\('data-demand-feature'\)/);
  assert.ok(source.indexOf('await prepareTargetDemand();') < source.indexOf('await selectWorkArea();'));
});
