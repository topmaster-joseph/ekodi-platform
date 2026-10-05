import fs from 'node:fs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const readText = file => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const failures = [];
const fail = message => failures.push(message);

const continuity = readJson('config/resilience-continuity-policy.json');
const zeroMaintenance = readJson('config/operator-zero-maintenance-policy.json');
const virtualization = readJson('config/virtualization-routing-policy.json');
const writeIngress = readJson('config/write-ingress-policy.json');
const board = readJson('config/replaceable-board-engine-policy.json');
const runtime = readText('resilience-continuity.js');
const aiRuntime = readText('ai-resilience-runtime.js');
const releaseRuntime = readText('scripts/guarded-worker-release.mjs');
const sharedRelease = readText('.github/workflows/deploy-site-core.yml');
const controlRelease = readText('.github/workflows/deploy-control-api.yml');

if (continuity.policyId !== 'EKODI-RESILIENCE-CONTINUITY-001' || continuity.status !== 'enforced') {
  fail('continuity policy must remain enforced');
}
if (continuity.owner !== 'ekodi-orchestrator') fail('EKODI Orchestrator must own the continuity lifecycle');
if (continuity.principle !== 'continuity-first-sustainable-replacement-then-root-cause-improvement') {
  fail('continuity-first principle drifted');
}

for (const key of [
  'immediateContinuityActionRequired',
  'doNotWaitForRootCauseBeforeSafeReplacement',
  'approvedReplacementPreferredOverEmergencyCustomPatch',
  'automaticRetryAndReconcileRequired',
  'circuitBreakerRequiredForUnhealthyDependencies',
  'healthGateRequiredBeforeTrafficPromotion',
  'rollbackToLastKnownGoodRequired',
  'evidenceRequiredForEveryFailover',
  'falseSuccessForbidden',
  'operatorEscalationOnlyAfterAutomaticRecoveryExhausted',
]) {
  if (continuity.forcedExecution?.[key] !== true) fail('forced execution rule missing: ' + key);
}

for (const key of [
  'authorizationBypassForbidden',
  'securityBoundaryReductionForbidden',
  'auditBypassForbidden',
  'ambiguousWriteCrossProviderReplayForbidden',
  'idempotencyRequiredForRetriedWrites',
  'durableQueueRequiredWhenWriteCompletionCannotBeProven',
]) {
  if (continuity.safetyBoundaries?.[key] !== true) fail('safety boundary missing: ' + key);
}

for (const key of [
  'continuityFirstRecoveryRequired',
  'safeImmediateReplacementRequired',
  'postRecoveryRootCauseImprovementRequired',
  'ambiguousWriteMustReconcileBeforeRetry',
  'approvedFallbackMustBeSustainableAndReplaceable',
  'productionVerificationBeforeCompletionRequired',
]) {
  if (zeroMaintenance.automation?.[key] !== true) fail('zero-maintenance integration missing: ' + key);
}

if (virtualization.recovery?.correctableNativeGapMustNotInterruptUserWorkflow !== true) {
  fail('virtualization recovery must preserve user workflow');
}
if (virtualization.recovery?.fallbackMustNotBecomeDefaultByHistory !== true) {
  fail('virtualization fallback must remain temporary and replaceable');
}
if (writeIngress.status !== 'enforced' || writeIngress.ingress?.idempotencyKeyRequired !== true) {
  fail('durable idempotent write ingress must remain enforced');
}
if (writeIngress.failure?.falseSuccessForbidden !== true) fail('write ingress false success must remain forbidden');
if (board.architecture?.runtimeExtensionFailureIsolation !== true) fail('board extension failure isolation must remain enforced');
if (board.architecture?.externalEngineMayNotOwnCanonicalCrud !== true) fail('external board engine must not own canonical CRUD');

for (const marker of [
  'continue-without-optional-ai',
  'queue-and-reconcile',
  'blindReplayForbidden: true',
  'rollback-last-known-good',
  'isolate-extension-use-canonical-core',
  'fail-closed-privileged',
]) {
  if (!runtime.includes(marker)) fail('continuity runtime missing marker: ' + marker);
}

if (!aiRuntime.includes('failureThreshold') || !aiRuntime.includes('cooldownMs')) {
  fail('AI circuit breaker contract missing');
}
if (!aiRuntime.includes('runFallback')) fail('AI safe fallback contract missing');
if (!releaseRuntime.includes('restoreVersionWithRetry') || !releaseRuntime.includes('previousVersion')) {
  fail('guarded release rollback contract missing');
}

for (const scenario of [
  'all-ai-providers-unavailable',
  'read-provider-unavailable',
  'ambiguous-write-outcome',
  'worker-unavailable',
  'third-party-module-unavailable',
  'deployment-candidate-unhealthy',
  'identity-provider-unavailable',
]) {
  if (!continuity.verification?.representativeFailureScenariosRequired?.includes(scenario)) {
    fail('required failure scenario missing: ' + scenario);
  }
}

for (const [name, workflow] of [['shared-site', sharedRelease], ['control-api', controlRelease]]) {
  for (const file of [
    'resilience-continuity.js',
    'config/resilience-continuity-policy.json',
    'config/operator-zero-maintenance-policy.json',
    'scripts/validate-resilience-continuity.mjs',
    'test/resilience-continuity.test.mjs',
  ]) {
    if (!workflow.includes("'" + file + "'")) fail(name + ' release trigger missing: ' + file);
  }
}

if (failures.length) {
  console.error('EKODI-RESILIENCE-CONTINUITY-001 validation failed');
  for (const item of failures) console.error('- ' + item);
  process.exit(1);
}

console.log('EKODI-RESILIENCE-CONTINUITY-001: OK');
console.log('- continuity before root-cause repair when a safe sustainable replacement exists');
console.log('- ambiguous writes reconcile before retry');
console.log('- security and authority boundaries remain fail-closed');
console.log('- fallback remains replaceable and production completion requires verification');
