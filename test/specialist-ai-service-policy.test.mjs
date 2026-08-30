import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

test('specialist AI policy covers registered professional services and future modules', () => {
  const policy = readJson('config/specialist-ai-service-policy.json');
  const ecosystem = readJson('config/ecosystem-services.json');
  const registered = new Map(ecosystem.services.map((service) => [service.id, service]));

  assert.equal(policy.status, 'standard');
  assert.ok(Array.isArray(policy.coveredServiceIds));
  assert.ok(policy.coveredServiceIds.length >= 8);
  assert.equal(new Set(policy.coveredServiceIds).size, policy.coveredServiceIds.length, 'covered service ids must be unique');

  for (const id of policy.coveredServiceIds) {
    const service = registered.get(id);
    assert.ok(service, `specialist AI service must exist in ecosystem registry: ${id}`);
    assert.match(service.url, /^https:\/\//, `${id} must have an HTTPS service URL`);
    assert.notEqual(service.category, 'admin', `${id} must remain a user-facing service`);
  }

  assert.equal(policy.futureCoverage.allRegisteredSpecialistAiModules, true);
  assert.equal(policy.futureCoverage.externalModuleContractApplies, true);
  assert.equal(policy.futureCoverage.subservicesInheritParentPolicy, true);
  assert.equal(policy.futureCoverage.newSpecialistAiMustPassPolicyValidationBeforeProduction, true);
});

test('specialist AI experience is invitation-first, task-first and private-by-default', () => {
  const policy = readJson('config/specialist-ai-service-policy.json');

  assert.ok(policy.experience.publicEntry.maxPrimaryNextActions <= 3);
  assert.ok(policy.experience.publicEntry.required.includes('free sign-in path'));
  assert.ok(policy.experience.publicEntry.forbidden.includes('service catalog dump as the first screen'));
  assert.equal(policy.privacyAndSharing.privateByDefault, true);
  assert.equal(policy.privacyAndSharing.explicitShareRequired, true);
  assert.equal(policy.privacyAndSharing.leaderOrAdminMayNotReadPrivateAiConversationByDefault, true);
  assert.equal(policy.privacyAndSharing.guestPreviewUsesSyntheticOrPublicDataOnly, true);
  assert.equal(policy.quality.noModelCallForBasicNavigation, true);
  assert.equal(policy.quality.subserviceInheritanceRequired, true);
});

test('specialist AI policy preserves human authority and provider independence', () => {
  const policy = readJson('config/specialist-ai-service-policy.json');
  const mission = readJson('config/ai-mission-governance.json');
  const resilience = readJson('config/ai-provider-independence.json');
  const external = readJson('config/external-ai-module-contract.json');
  const shell = readJson('config/user-ui-shell.json');

  assert.equal(policy.aiBehavior.defaultRole, mission.authorityModel.specialistAiRole);
  assert.equal(policy.actionSafety.highImpact, 'human_gate');
  assert.ok(mission.nonNegotiables.includes('no_hidden_high_impact_automation'));
  assert.ok(mission.nonNegotiables.includes('no_ai_provider_dependency_for_core_service'));
  assert.ok(mission.nonNegotiables.includes('provider_failure_must_degrade_not_disable_service'));

  assert.equal(resilience.defaultPolicy.providerRequiredForCoreService, false);
  assert.equal(resilience.defaultPolicy.providerFailureMustNotFailCoreRequest, true);
  assert.equal(resilience.defaultPolicy.providerSecretsAllowedInBrowser, false);

  assert.equal(external.security.browserDirectExecution, false);
  assert.equal(external.security.providerMayAccessEkodiDatabaseDirectly, false);
  assert.equal(external.security.providerMayAccessSharedDriveDirectly, false);
  assert.equal(external.security.providerSecretsStayServerSide, true);
  assert.equal(external.security.tenantContextRequired, true);
  assert.equal(external.security.capabilityCheckRequired, true);

  assert.ok(shell.scope.includes('public'));
  assert.ok(shell.scope.includes('workspace'));
  assert.equal(shell.adminExcluded, true);
});
