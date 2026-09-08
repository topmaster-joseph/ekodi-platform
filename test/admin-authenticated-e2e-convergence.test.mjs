import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const retrySource = () => readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E waits for canonical production menu-registry convergence', async () => {
  const source = await retrySource();
  assert.match(source, /https:\/\/ekodi\.kr\/admin-menu-registry\.js/);
  assert.match(source, /const productionConvergenceAttempts = 36/);
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /missingProductionMenus/);
  assert.match(source, /await waitForProductionMenuRegistry\(\)/);
  assert.match(source, /production Admin registry converged/);
});
