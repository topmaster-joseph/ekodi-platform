import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI Ops section activation preserves DOM hidden attribute parity for audit-records', async () => {
  const source = await readFile(new URL('../ai-ops-admin.js', import.meta.url), 'utf8');
  assert.match(source,/section\.dataset\.panel = `\$\{SECTION\} audit-records`/);
  assert.match(source,/const visible = targets\.includes\(SECTION\)/);
  assert.match(source,/node\.classList\.toggle\('hidden-panel', !visible\)/);
  assert.match(source,/node\.hidden = !visible/);
  assert.match(source,/if \(visible\) node\.dataset\.adminListLayout = 'single'/);
});

test('maturity requires a fresh super_admin session and serializes explicit auth recovery', async () => {
  const source = await readFile(new URL('../platform-maturity-admin.js', import.meta.url), 'utf8');
  assert.match(source,/let authorizationInFlight = null/);
  assert.match(source,/if \(authorizationInFlight\) return authorizationInFlight/);
  assert.match(source,/session\?\.role !== 'super_admin'\) return deny\(\)/);
  assert.match(source,/authorizationInFlight = null/);
  assert.match(source,/if \(!authorized\) \{ void authorize\(\); return; \}/);
  assert.match(source,/authorized = true; root\.dataset\.ekodiMaturityAuthorized = 'true'/);
  assert.match(source,/root\.dataset\.ekodiMaturityAuthorized = 'false'/);
});

test('production Chromium reports the exact panel and protected auth state instead of silently skipping',async()=>{
  const source=await readFile(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');
  assert.match(source,/maturityAuthorization:section === 'maturity'/);
  assert.match(source,/matchingPanels:/);
  assert.match(source,/hiddenClass:panel\.classList\.contains\('hidden-panel'\)/);
  assert.match(source,/Admin panel visibility contract failed/);
  assert.match(source,/menu-failed-\$\{id\}\.png/);
  assert.match(source,/throw new Error\(\x60\$\{id\}: Admin panel visibility contract failed/);
});
