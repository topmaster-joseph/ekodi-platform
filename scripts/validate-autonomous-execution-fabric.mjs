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
expect(doc.safety?.privilegedContainerForbidden === true, 'privileged containers must be forbidden');
expect(doc.safety?.hostDockerSocketForbidden === true, 'host Docker socket exposure must be forbidden');
expect(doc.safety?.productionSecretsInSandboxForbidden === true, 'production secrets must not enter sandboxes');
expect(doc.safety?.authorityExpansionForbidden === true, 'execution fabric must not expand authority');
expect(doc.activation?.currentState === 'architecture_registered_not_yet_runtime_proven', 'architecture must not claim runtime proof prematurely');
expect(Array.isArray(doc.evidenceRequiredBeforeActivation) && doc.evidenceRequiredBeforeActivation.length >= 8, 'activation evidence set is incomplete');

const lifecycle = new Set(doc.executionLifecycle || []);
for (const stage of ['authorize','allocate','implement','test','verify','reverify','staging_verification','production_verification','recover_if_needed','record_evidence']) {
  expect(lifecycle.has(stage), `missing lifecycle stage: ${stage}`);
}

if (failures.length) {
  console.error('EKODI Autonomous Execution Fabric validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('EKODI Autonomous Execution Fabric architecture contract validated.');
console.log('Runtime production readiness is intentionally NOT asserted by this validator.');
