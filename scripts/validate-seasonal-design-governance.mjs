import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

const policy = await readJson('config/seasonal-design-governance.json');
const dna = await readJson('config/user-ui-dna.json');

const fail = message => {
  console.error(`[seasonal-design-governance] ${message}`);
  process.exitCode = 1;
};

if (policy.version !== '1.0.0') fail('unexpected policy version');
if (policy.timezone !== 'Asia/Seoul') fail('timezone must remain Asia/Seoul');

for (const required of [
  'service_identity_before_season',
  'staging_before_production',
  'no_ai_provider_dependency_for_core_service',
  'report_what_changed_and_how_to_roll_back',
]) {
  if (!policy.principles?.includes(required)) fail(`missing principle: ${required}`);
}

for (const required of ['stage', 'verify', 'promote_if_authorized', 'verify_public_host', 'report', 'rollback_if_needed']) {
  if (!policy.decisionLoop?.includes(required)) fail(`missing decision-loop step: ${required}`);
}

if (policy.changeClasses?.material_brand_change?.autonomy !== 'human_gate') {
  fail('material brand changes must remain human-gated');
}
if (policy.changeClasses?.forbidden_automatic?.autonomy !== 'never') {
  fail('forbidden automatic changes must remain forbidden');
}

const defaultPolicy = policy.servicePolicies?.default;
if (!defaultPolicy) fail('missing default service policy');
if (defaultPolicy?.autoProductionMinor !== false) {
  fail('default minor production changes must require administrator approval');
}

const services = Object.keys(dna.services || {});
for (const service of services) {
  const servicePolicy = policy.servicePolicies?.[service];
  if (!servicePolicy) {
    fail(`missing explicit seasonal policy for UI service: ${service}`);
    continue;
  }
  if (servicePolicy.autoProductionMinor && !servicePolicy.autoStage) {
    fail(`${service} cannot auto-promote minor changes when autoStage is disabled`);
  }
}

for (const protectedService of ['pay', 'mail', 'cloud']) {
  const servicePolicy = policy.servicePolicies?.[protectedService];
  if (servicePolicy?.autoProductionMinor !== false) {
    fail(`${protectedService} must not auto-promote seasonal design changes`);
  }
}

for (const required of [
  'desktop_layout',
  'mobile_layout',
  'text_contrast',
  'text_over_image_readability',
  'public_host_smoke_test',
]) {
  if (!policy.verification?.required?.includes(required)) fail(`missing verification: ${required}`);
}

if (!policy.reporting?.administratorReportRequired) fail('administrator report must remain mandatory');
for (const required of ['before_reference', 'after_reference', 'rollback_reference', 'public_host_result']) {
  if (!policy.reporting?.fields?.includes(required)) fail(`missing report field: ${required}`);
}

if (!process.exitCode) {
  console.log(`Seasonal design governance is valid for ${services.length} UI services.`);
}
