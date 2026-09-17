import fs from 'node:fs';
import process from 'node:process';

const architecturePath = 'governance/architecture/ekodi-autonomous-execution-fabric.v1.json';
const policyPath = 'config/autonomous-execution-fabric-policy.json';
const doc = JSON.parse(fs.readFileSync(architecturePath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(doc.generation === 10, 'generation must remain 10');
expect(doc.generationLabel === 'Self-Architecture Optimization', 'generation label mismatch');
expect(doc.constitutionalAlignment?.directProductionMutationForbidden === true, 'direct production mutation must remain forbidden');
expect(doc.constitutionalAlignment?.humanGateRequiredForRedClass === true, 'red-class work must require a human gate');
expect(doc.constitutionalAlignment?.rollbackRequired === true, 'rollback must be required');
expect(doc.constitutionalAlignment?.virtualizationFirst === true, 'virtualization-first execution must be constitutional');
expect(doc.constitutionalAlignment?.failClosedWhenIsolationUnavailable === true, 'execution must fail closed when isolation is unavailable');
expect(doc.operatingModel?.executionPlane === 'ephemeral-virtualized-isolated-sandbox', 'execution plane must remain ephemeral, virtualized and isolated');
expect(doc.operatingModel?.noAlwaysOnPerAgentRuntime === true, 'per-agent always-on runtimes are forbidden at S0');
expect(doc.operatingModel?.persistentOperatorHostMayExecuteRepositoryCode === false, 'persistent operator hosts must not execute repository code');
expect(doc.safety?.privilegedContainerForbidden === true, 'privileged containers must be forbidden');
expect(doc.safety?.hostContainerSocketForbidden === true, 'host container socket exposure must be forbidden');
expect(doc.safety?.productionSecretsInSandboxForbidden === true, 'production secrets must not enter sandboxes');
expect(doc.safety?.authorityExpansionForbidden === true, 'execution fabric must not expand authority');
expect(doc.safety?.noNewPrivilegesRequired === true, 'no-new-privileges must be required');
expect(doc.safety?.capabilitiesDroppedByDefault === true, 'Linux capabilities must be dropped by default');
expect(doc.activation?.currentState === 'execution_runtime_phase1_proven_production_not_ready', 'activation state must reflect phase-1 runtime proof without claiming production readiness');
expect(Array.isArray(doc.evidenceRequiredBeforeActivation) && doc.evidenceRequiredBeforeActivation.length >= 8, 'activation evidence set is incomplete');
expect(doc.evidenceProgress?.sandbox_isolation_test === 'proven_phase1_rootless_provider', 'phase-1 sandbox isolation evidence must remain recorded');

for (const profile of ['standard', 'hardened', 'microvm']) {
  expect(Boolean(doc.isolationProfiles?.[profile]), `missing isolation profile: ${profile}`);
}
expect(doc.isolationProfiles?.standard?.technologyClass === 'rootless-oci-container', 'standard isolation must remain rootless OCI');
expect(doc.isolationProfiles?.hardened?.technologyClass === 'gvisor-or-equivalent-application-kernel', 'hardened isolation must remain application-kernel class');
expect(doc.isolationProfiles?.microvm?.technologyClass === 'firecracker-or-equivalent-microvm', 'microvm isolation class mismatch');

expect(policy.status === 'enforced', 'execution policy must be enforced');
expect(policy.virtualizationFirst?.required === true, 'policy must require virtualization-first execution');
expect(policy.virtualizationFirst?.failClosedWhenUnavailable === true, 'policy must fail closed when virtualization is unavailable');
expect(policy.virtualizationFirst?.persistentHostExecutionForbiddenForRepositoryCode === true, 'policy must forbid persistent-host repository execution');
expect(policy.sandbox?.filesystem?.rootFilesystemReadOnly === true, 'sandbox root filesystem must be read-only');
expect(policy.sandbox?.filesystem?.hostContainerSocketForbidden === true, 'host container socket must be forbidden');
expect(policy.sandbox?.process?.privilegedForbidden === true, 'privileged execution must be forbidden');
expect(policy.sandbox?.process?.dropCapabilities === true, 'capabilities must be dropped');
expect(policy.sandbox?.process?.noNewPrivileges === true, 'no-new-privileges must be enforced');
expect(policy.sandbox?.secrets?.productionSecretsForbidden === true, 'production secrets must be forbidden in sandboxes');
expect(policy.evidence?.executionReceiptRequired === true, 'structured execution receipt must be required');
expect(policy.supplyChain?.artifactDigestRequired === true, 'artifact/result digest must be required');
expect(policy.supplyChain?.providerIndependent === true, 'execution fabric must remain provider independent');

const lifecycle = new Set(doc.executionLifecycle || []);
for (const stage of ['authorize','select_isolation_profile','allocate','implement','test','verify','reverify','emit_execution_receipt','staging_verification','production_verification','recover_if_needed','record_evidence']) {
  expect(lifecycle.has(stage), `missing lifecycle stage: ${stage}`);
}

if (failures.length) {
  console.error('EKODI Autonomous Execution Fabric validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('EKODI Autonomous Execution Fabric virtualization-first contract validated.');
console.log('- execution runtime phase 1: proven');
console.log('- autonomous production readiness: intentionally NOT asserted');
