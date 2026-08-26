import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../config/marketing-tenants.json', import.meta.url), 'utf8'));
const ledger = await readFile(new URL('../marketing-ledger-control.js', import.meta.url), 'utf8');

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

test('pilot reuses the existing Marketing campaign and event ledger without synthetic outcomes', () => {
  assert.equal(cfg.pilot.campaign.ledger, 'existing_marketing_campaigns_and_events');
  assert.equal(cfg.pilot.campaign.executionMode, 'human_gate');
  assert.equal(cfg.pilot.campaign.audienceSegment, 'inquiry');
  assert.match(ledger, /const SERVICE_EVENTS = new Set\(\['inquiry','consultation','proposal','contract','onboarding','active','renewal'/);
  assert.match(ledger, /POST[^]*\/api\/marketing\/ledger\/events/);
  assert.match(ledger, /POST[^]*\/api\/marketing\/ledger\/campaigns/);
  assert.match(ledger, /humanGate:'awaiting_human'/);
  assert.match(ledger, /externalExecution:false/);
});
