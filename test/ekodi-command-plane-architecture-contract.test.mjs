import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const architecture = JSON.parse(fs.readFileSync(new URL('../governance/architecture/ekodi-command-plane.v1.json', import.meta.url), 'utf8'));

test('Command Plane architecture keeps provider authority subordinate to EKODI Core', () => {
  assert.equal(architecture.providerPolicy.providerIndependent, true);
  assert.equal(architecture.providerPolicy.providerMayOwnAuthority, false);
  assert.equal(architecture.providerPolicy.providerMayOwnCanonicalState, false);
  assert.equal(architecture.providerPolicy.coreOnlyFallbackRequired, true);
});

test('Command Plane architecture requires bounded proactive delegation and symbolic resource targeting', () => {
  assert.equal(architecture.proactiveExecution.requiresStandingDelegation, true);
  assert.equal(architecture.proactiveExecution.highRiskRequiresHumanGate, true);
  assert.equal(architecture.proactiveExecution.redChangeClassRequiresHumanGate, true);
  assert.equal(architecture.resourceAddressing.mode, 'symbolic');
  assert.equal(architecture.resourceAddressing.commandPlaneMayHardCodeLegacyUserOrAdminHostname, false);
});
