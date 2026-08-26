import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../migrations/0039_marketing_experiment_registry.sql', import.meta.url), 'utf8');

test('only EKODIBIZ is the active Marketing AI validation subject', () => {
  assert.equal(cfg.pilot.mode, 'single_internal_validation');
  assert.equal(cfg.pilot.activeWorkspaceType, 'tenant');
  assert.equal(cfg.pilot.activeWorkspaceKey, 'ekodibiz');
  assert.equal(cfg.pilot.externalCustomerActivation, false);
  assert.equal(cfg.pilot.externalWorkspacesRole, 'comparison_pool_only');
  const biz = cfg.internalConsumers.find(row => row.id === 'ekodibiz');
  assert.equal(biz.pilotRole, 'active_baseline');
  for (const tenant of cfg.tenants) assert.equal(tenant.pilotRole, 'comparison_pool_only');
});

test('pilot uses a stable module benchmark contract for later external modules', () => {
  assert.equal(cfg.pilot.baselineModuleKey, 'ekodi-native-marketing-ai-v1');
  assert.equal(cfg.pilot.comparisonFramework, 'ekodi-marketing-benchmark-v1');
  for (const metric of ['inquiries','consultations','proposals','contracts','attributed_value_krw','marketing_actions_completed','human_minutes_saved']) {
    assert.ok(cfg.pilot.kpis.includes(metric));
  }
});

test('experiment migration seeds no fake performance and creates only an EKODIBIZ draft campaign', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketing_experiments/);
  assert.match(migration, /ekodibiz-native-20260826/);
  assert.match(migration, /ekodi-marketing-benchmark-v1/);
  assert.match(migration, /'tenant','ekodibiz'/);
  assert.match(migration, /'draft','system:ekodibiz-pilot'/);
  assert.match(migration, /verified_only/);
  assert.doesNotMatch(migration, /INSERT[^;]+INTO marketing_events/is);
});
