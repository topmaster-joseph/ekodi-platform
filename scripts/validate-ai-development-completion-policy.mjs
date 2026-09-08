import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = file => JSON.parse(read(file));
let failed = false;

function fail(file, message) {
  console.error(`❌ ${file}: ${message}`);
  failed = true;
}

function requireText(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) fail(file, `missing required completion-policy marker: ${needle}`);
  }
}

const policyFile = 'config/ai-development-completion-policy.json';
const policy = readJson(policyFile);

if (policy.policyId !== 'AI-COMPLETE-001') fail(policyFile, 'policyId must be AI-COMPLETE-001');
if (policy.status !== 'active') fail(policyFile, 'policy must remain active');
if (policy.defaultRule !== 'production-verified-before-complete') fail(policyFile, 'defaultRule must require production verification');

for (const key of [
  'successfulDeployCommandIsNotCompletion',
  'successfulCommitIsNotCompletion',
  'successfulPullRequestIsNotCompletion',
  'realProductionHostnameRequired',
  'functionalBehaviorRequired',
  'retryRepairRedeployReverifyOnFailure',
  'completionReportBlockedUntilVerified',
  'productionCredentialsRemainOutsideAgentWorkspace',
  'guardedCentralReleasePathRequired',
]) {
  if (policy.rules?.[key] !== true) fail(policyFile, `required rule must be true: ${key}`);
}

for (const evidence of [
  'task_id',
  'branch',
  'commit_sha',
  'validation_result',
  'deployment_result',
  'production_hostname',
  'production_functional_checks',
  'observability_check',
  'verification_timestamp',
]) {
  if (!policy.requiredEvidenceForProductionChange?.includes(evidence)) {
    fail(policyFile, `missing required production evidence field: ${evidence}`);
  }
}

if (!policy.exceptionPolicy?.allowed) fail(policyFile, 'bounded exceptions must remain explicitly modeled');
for (const exceptionClass of ['read-only-analysis', 'documentation-only', 'non-production-experiment', 'human-gate-required', 'external-authority-blocked']) {
  if (!policy.exceptionPolicy?.allowedClasses?.includes(exceptionClass)) fail(policyFile, `missing allowed exception class: ${exceptionClass}`);
}
for (const requirement of ['explicit-exception-class', 'reason-recorded', 'no-false-production-completion-claim']) {
  if (!policy.exceptionPolicy?.requirements?.includes(requirement)) fail(policyFile, `missing exception requirement: ${requirement}`);
}

for (const file of [
  'AGENTS.override.md',
  'AI_DEVELOPMENT_POLICY.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.github/workflows/production-gate.yml',
  '.github/workflows/ai-parallel-development-policy.yml',
]) {
  if (!fs.existsSync(path.join(root, file))) fail(file, 'required completion-policy binding is missing');
}

requireText('AGENTS.override.md', [
  'config/ai-development-completion-policy.json',
  'real production service',
  'must not report the task as complete',
]);
requireText('AI_DEVELOPMENT_POLICY.md', [
  'AI-COMPLETE-001',
  'production-verified-before-complete',
  'production verification evidence',
]);
requireText('CLAUDE.md', ['production verification evidence', 'must not report completion']);
requireText('GEMINI.md', ['production verification evidence', 'must not report completion']);
requireText('.github/copilot-instructions.md', ['production verification evidence', 'must not report completion']);
requireText('.github/workflows/production-gate.yml', [
  'production-completion-evidence.json',
  'Upload production completion evidence',
  'production-verified-complete',
]);
requireText('.github/workflows/ai-parallel-development-policy.yml', [
  'validate-ai-development-completion-policy.mjs',
  'config/ai-development-completion-policy.json',
]);

if (failed) {
  console.error('AI development completion policy validation failed. EKODI must not declare production work complete without real production verification evidence.');
  process.exit(1);
}

console.log('✅ AI-COMPLETE-001 validated: production verification is mandatory before completion reporting.');
