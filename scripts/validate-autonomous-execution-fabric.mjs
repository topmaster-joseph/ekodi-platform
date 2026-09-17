import fs from 'node:fs';
import process from 'node:process';

const path = 'governance/architecture/ekodi-autonomous-execution-fabric.v1.json';
const doc = JSON.parse(fs.readFileSync(path, 'utf8'));

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(doc.generation === 10, 'generation must remain 10');
expect(doc.generationLabel === 'Self-Architecture Optimization', 'generation label mismatch');
expect(doc.constitutionalAlignment?.directProductionMutationForbidden === true, 'direct production mutation must remain forbidden');
expect(doc.constitutionalAlignment?.humanGateRequiredForRedClass === true, 'red-class work must require a human gate');
expect(doc.constitutionalAlignment?.rollbackRequired === true, 'rollback must be required');
expect(doc.operatingModel?.executionPlane === 'ephemeral-isolated-sandbox', 'execution plane must remain ephemeral and isolated');
expect(doc.operatingModel?.noAlwaysOnPerAgentRuntime === true, 'per-agent always-on runtimes are forbidden at S0');
expect(doc.operatingModel?.providerIndependent === true, 'execution fabric must remain provider independent');
expect(doc.operatingModel?.providerLockInForbidden === true, 'provider lock-in must remain forbidden');
expect(doc.mandatoryExecutionBoundary?.allMutatingEngineeringWorkRequiresExecutionFabric === true, 'all mutating engineering work must use the execution fabric');
expect(doc.mandatoryExecutionBoundary?.directHostMutationForbidden === true, 'direct host mutation must remain forbidden');
expect(doc.mandatoryExecutionBoundary?.mergeRequiresVirtualizedExecutionGate === true, 'merge must require a virtualized execution gate');
expect(doc.safety?.privilegedContainerForbidden === true, 'privileged containers must be forbidden');
expect(doc.safety?.hostDockerSocketForbidden === true, 'host Docker socket exposure must be forbidden');
expect(doc.safety?.productionSecretsInSandboxForbidden === true, 'production secrets must not enter sandboxes');
expect(doc.safety?.nonRootRequired === true, 'sandbox execution must be non-root');
expect(doc.safety?.dropAllCapabilitiesByDefault === true, 'sandbox capabilities must be dropped by default');
expect(doc.safety?.noNewPrivilegesRequired === true, 'sandbox must require no-new-privileges');
expect(doc.safety?.authorityExpansionForbidden === true, 'execution fabric must not expand authority');
expect(doc.runtimeEvidence?.nonProductionIsolatedExecutionProven === true, 'non-production isolated runtime proof must be recorded');
expect(doc.runtimeEvidence?.autonomousProductionReadinessProven === false, 'production readiness must remain unclaimed until complete evidence exists');
expect(doc.activation?.currentState === 'nonproduction_runtime_proven_activation_incomplete', 'activation state must remain partial until full runtime proof exists');
expect(Array.isArray(doc.evidenceRequiredBeforeActivation) && doc.evidenceRequiredBeforeActivation.length >= 8, 'activation evidence set is incomplete');

const lifecycle = new Set(doc.executionLifecycle || []);
for (const stage of ['authorize','select_isolation_profile','allocate','implement','test','verify','reverify','staging_verification','production_verification','recover_if_needed','record_evidence']) {
  expect(lifecycle.has(stage), `missing lifecycle stage: ${stage}`);
}

if (failures.length) {
  console.error('EKODI Autonomous Execution Fabric validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('EKODI Autonomous Execution Fabric architecture contract validated.');
console.log('Non-production isolated execution is proven; autonomous production readiness is intentionally NOT asserted.');
