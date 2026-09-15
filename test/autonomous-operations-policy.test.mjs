import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const policy = JSON.parse(
  readFileSync(new URL('../config/autonomous-operations-policy.json', import.meta.url), 'utf8'),
);
const agentOverride = readFileSync(new URL('../AGENTS.override.md', import.meta.url), 'utf8');

test('autonomous operations policy keeps routine operation autonomous and owner sovereignty explicit', () => {
  assert.equal(policy.policyId, 'EKODI-AUTONOMY-001');
  assert.equal(policy.status, 'active');
  assert.equal(policy.defaultPosture.autonomousWithinExistingAuthority, true);
  assert.equal(policy.defaultPosture.simplifyBeforeAdding, true);
  assert.equal(policy.defaultPosture.reuseBeforeCreating, true);
  assert.equal(policy.defaultPosture.humanSovereigntyRemainsFinal, true);
  assert.ok(policy.autonomousWithoutOwnerPrompt.includes('bug-fix'));
  assert.ok(policy.autonomousWithoutOwnerPrompt.includes('reduce-unnecessary-complexity'));
  assert.ok(policy.ownerDecisionRequired.includes('constitutional-c2-or-c3-change'));
  assert.ok(policy.ownerDecisionRequired.includes('owner-only-authentication-consent-or-provider-approval'));
  assert.equal(policy.safety.neverExpandOwnAuthority, true);
  assert.equal(policy.safety.neverBypassConstitutionOrGuardrails, true);
  assert.equal(policy.safety.guardedReleaseAndProductionVerificationRemainRequired, true);
});

test('agent override loads and enforces the autonomy contract', () => {
  assert.match(agentOverride, /config\/autonomous-operations-policy\.json/);
  assert.match(agentOverride, /operate autonomously within already delegated authority/);
  assert.match(agentOverride, /simplify, reuse, remove duplication and reduce unnecessary complexity/);
  assert.match(agentOverride, /escalate to sovereign human authority only/);
});
