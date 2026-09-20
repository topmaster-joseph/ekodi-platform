import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const retrySource = () => readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8');

test('authenticated Admin E2E waits for canonical production menu-registry convergence', async () => {
  const source = await retrySource();
  assert.match(source, /https:\/\/ekodi\.kr\/admin-menu-registry\.js/);
  assert.match(source, /const productionConvergenceAttempts = 36/);
  assert.match(source, /cache:'?no-store'?|cache: 'no-store'/);
  assert.match(source, /missingProductionMenus/);
  assert.match(source, /await waitForProductionMenuRegistry\(\)/);
  assert.match(source, /production Admin registry converged/);
  assert.match(source, /compatibilityMenuBaseUrl: null/);
  const retiredAdmin=['https://admin',['ekodi','kr'].join('.')].join('.');
  assert.equal(source.includes(retiredAdmin),false);
});

test('authenticated Admin E2E waits for protected maturity API convergence before menu rendering', async () => {
  const source = await retrySource();
  assert.match(source, /https:\/\/ekodi\.kr\/api\/control\/platform-maturity/);
  assert.match(source, /E2E_ADMIN_TOKEN/);
  assert.match(source, /authorization:`Bearer \$\{e2eAdminToken\}`/);
  assert.match(source, /certificationStatus === 'not-claimed'/);
  assert.match(source, /Array\.isArray\(payload\.model\?\.domains\)/);
  assert.match(source, /ecosystem-services\.json/);
  assert.match(source, /site-lifecycle-registry\.json/);
  assert.match(source, /capability-registry\.json/);
  assert.match(source, /scope\.services === expectedMaturityScope\.services/);
  assert.match(source, /scope\.workspaceSites === expectedMaturityScope\.workspaceSites/);
  assert.match(source, /scope\.systemFunctions === expectedMaturityScope\.systemFunctions/);
  assert.match(source, /scope\.totalScopes === expectedMaturityScope\.totalScopes/);
  assert.match(source, /await waitForMaturityApi\(\)/);
  assert.match(source, /production maturity API converged/);
});
