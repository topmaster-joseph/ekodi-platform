import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('seasonal design remains a reversible layer over service identity', async () => {
  const policy = await readJson('config/seasonal-design-governance.json');
  assert.ok(policy.principles.includes('service_identity_before_season'));
  assert.ok(policy.principles.includes('season_is_a_thin_visual_layer_not_a_redesign'));
  assert.equal(policy.changeClasses.material_brand_change.autonomy, 'human_gate');
  assert.equal(policy.changeClasses.forbidden_automatic.autonomy, 'never');
});

test('minor automatic production changes remain guarded and service-specific', async () => {
  const policy = await readJson('config/seasonal-design-governance.json');
  assert.equal(policy.servicePolicies.default.autoProductionMinor, false);
  assert.equal(policy.servicePolicies.church.autoProductionMinor, true);
  assert.equal(policy.servicePolicies.community.autoProductionMinor, true);
  assert.equal(policy.servicePolicies.marketing.autoProductionMinor, true);
  assert.equal(policy.servicePolicies.my.autoProductionMinor, true);
  assert.equal(policy.servicePolicies.biz.autoProductionMinor, false);
  assert.equal(policy.servicePolicies.pay.autoProductionMinor, false);
  assert.equal(policy.servicePolicies.mail.autoProductionMinor, false);
  assert.equal(policy.servicePolicies.cloud.autoProductionMinor, false);
});

test('church context prefers liturgical calendar over generic seasonality', async () => {
  const policy = await readJson('config/seasonal-design-governance.json');
  assert.equal(policy.servicePolicies.church.priorityContext, 'liturgical_calendar_before_meteorological_season');
  assert.ok(policy.servicePolicies.church.protected.includes('scripture_prominence'));
  assert.ok(policy.servicePolicies.church.protected.includes('church_identity'));
});

test('administrator reporting and rollback evidence are mandatory', async () => {
  const policy = await readJson('config/seasonal-design-governance.json');
  assert.equal(policy.reporting.administratorReportRequired, true);
  for (const field of ['before_reference', 'after_reference', 'public_host_result', 'rollback_reference']) {
    assert.ok(policy.reporting.fields.includes(field));
  }
  for (const step of ['stage', 'verify', 'verify_public_host', 'report', 'rollback_if_needed']) {
    assert.ok(policy.decisionLoop.includes(step));
  }
});

test('deterministic advisor works without an AI provider and respects service autonomy', async () => {
  const script = new URL('../scripts/seasonal-design-advisor.mjs', import.meta.url);
  const { stdout } = await execFileAsync(process.execPath, [fileURLToPath(script), '--date', '2026-08-19', '--service', 'community']);
  const plan = JSON.parse(stdout);
  assert.equal(plan.mode, 'deterministic_core');
  assert.equal(plan.season, 'summer');
  assert.equal(plan.services[0].service, 'community');
  assert.equal(plan.services[0].action, 'stage_verify_and_guarded_auto_minor');
  assert.match(plan.services[0].providerIndependentFallback, /approved_assets|current_surface/);
});
