import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const fail = message => failures.push(message);
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const policy = readJson('config/ai-claim-integrity-policy.json');
const orchestration = readJson('config/ai-change-orchestration-policy.json');
const completion = readJson('config/ai-development-completion-policy.json');
const constitution = readJson('governance/constitution/constitution.json');
const agents = read('AGENTS.override.md');
const contract = read('ORCHESTRATOR_PRODUCTION_CONTRACT.md');
const runtime = read('ai-claim-integrity.js');
const router = read('ai-control-provider-router.js');
const core = read('ai-control-core.js');

if (policy.schemaVersion !== 1 || policy.policyId !== 'AI-CLAIM-INTEGRITY-001' || policy.status !== 'enforced') fail('claim integrity policy must be enforced schema v1');
for (const key of [
  'aiStatementNeverCreatesSystemState',
  'otherAgentOutputIsAssertionNotEvidence',
  'conversationMemoryMayNotSolelyProveCurrentOperationalState',
  'currentOperationalStateRequiresFreshEvidence',
  'completionClaimRequiresVerifiedEvidence',
  'scopeOfClaimMayNotExceedScopeOfEvidence',
  'singleSurfaceEvidenceMayNotProveAllSurfaces',
  'unknownStateMustRemainUnknown',
  'independentVerifierRequiredForCompletionAndBroadScopeClaims',
  'claimReceiptRequiredForMaterialOperationalClaims'
]) if (policy.rules?.[key] !== true) fail(`claim-integrity rule missing: ${key}`);

for (const source of ['direct-runtime-observation','deployment-provider-record','authoritative-operational-database','git-default-branch','conversation-memory','model-inference']) {
  if (!policy.authoritativeSourcePriority?.includes(source)) fail(`source priority missing: ${source}`);
}
if (policy.freshness?.memoryEvidenceMaxAgeSecondsForCurrentOperationalState !== 0) fail('memory may not prove current operational state');
if (policy.integration?.finalResponseGuardRequired !== true) fail('final response guard must remain required');
if (orchestration.claimIntegrity?.policyId !== policy.policyId || orchestration.claimIntegrity?.finalResponseGuardRequired !== true) fail('orchestration must bind claim integrity');
if (completion.rules?.claimScopeMustMatchEvidenceScope !== true) fail('completion policy must prevent scope inflation');
if (completion.rules?.memoryCannotProveCurrentOperationalState !== true) fail('completion policy must reject memory-only current state');
if (constitution.aiClaimIntegrityPolicy?.id !== policy.policyId || constitution.aiClaimIntegrityPolicy?.status !== 'active') fail('constitution must activate claim integrity');
if (!constitution.principles?.includes('evidence-gated-ai-claims')) fail('constitutional principle evidence-gated-ai-claims missing');
if (!agents.includes('AI-CLAIM-INTEGRITY-001')) fail('agent override must inherit claim integrity');
if (!contract.includes('AI-CLAIM-INTEGRITY-001')) fail('orchestrator production contract must inherit claim integrity');
if (!runtime.includes('guardOperationalResponse')) fail('runtime response guard missing');
if (!router.includes('guardOperationalResponse')) fail('provider router must apply deterministic response guard');
if (!core.includes('AI-CLAIM-INTEGRITY-001')) fail('origin synthesis must be instructed by claim-integrity policy');

if (failures.length) {
  console.error(`EKODI AI claim integrity validation failed (${failures.length})`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('EKODI AI Claim Integrity AI-CLAIM-INTEGRITY-001: OK');
