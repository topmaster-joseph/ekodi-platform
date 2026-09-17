import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config', 'virtualized-execution-policy.json');
const fabricPolicyPath = path.join(root, 'config', 'autonomous-execution-fabric-policy.json');
const architecturePath = path.join(root, 'governance', 'architecture', 'ekodi-autonomous-execution-fabric.v1.json');
const evidencePath = path.join(root, 'evidence', 'runtime', 'autonomous-execution-fabric', '2026-09-17-initial-proof.json');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const file of [policyPath, fabricPolicyPath, architecturePath, evidencePath]) {
  expect(fs.existsSync(file), `required execution-fabric file missing: ${path.relative(root, file)}`);
}

if (failures.length === 0) {
  const policy = readJson(policyPath);
  const fabric = readJson(fabricPolicyPath);
  const architecture = readJson(architecturePath);
  const evidence = readJson(evidencePath);

  expect(policy.policyId === 'EXEC-FABRIC-001', 'virtualized execution policy id mismatch');
  expect(policy.status === 'enforced', 'virtualized execution policy must remain enforced');
  expect(policy.generation === 10, 'virtualized execution policy must remain Generation 10');
  expect(policy.scope?.allMutatingWorkRequiresFabric === true, 'all mutating work must require the execution fabric');
  expect(policy.scope?.directHostMutationForbidden === true, 'direct host mutation must remain forbidden');
  expect(policy.scope?.directProductionMutationForbidden === true, 'direct production mutation must remain forbidden');
  expect(policy.providerStrategy?.providerIndependent === true, 'provider independence must remain enabled');
  expect(policy.providerStrategy?.providerLockInForbidden === true, 'provider lock-in must remain forbidden');
  expect(policy.providerStrategy?.fallbackMustPreserveOrIncreaseIsolation === true, 'fallback may not weaken isolation');

  const s0 = policy.isolationProfiles?.['s0-default'] || {};
  expect(s0.outerBoundary === 'ephemeral-cloud-vm', 'S0 outer boundary must be an ephemeral cloud VM');
  expect(s0.innerBoundary === 'rootless-container', 'S0 inner boundary must be a rootless container');
  expect(s0.nonRoot === true, 'S0 must require non-root execution');
  expect(s0.networkDefault === 'deny', 'S0 network must default deny');
  expect(s0.readOnlyRootFilesystem === true, 'S0 root filesystem must be read-only');
  expect(s0.capabilities === 'drop-all', 'S0 must drop all Linux capabilities');
  expect(s0.noNewPrivileges === true, 'S0 must set no-new-privileges');
  expect(s0.hostDockerSocket === 'forbidden', 'host Docker socket must remain forbidden');
  expect(s0.productionSecrets === 'forbidden', 'production secrets must remain forbidden in S0 sandboxes');

  expect(fabric.status === 'enforced', 'autonomous execution fabric policy must remain enforced');
  expect(fabric.executionBoundary?.allMutatingWorkRequiresFabric === true, 'fabric policy must enforce all mutations through the fabric');
  expect(fabric.executionBoundary?.providerIndependent === true, 'fabric policy must remain provider independent');
  expect(fabric.sandbox?.process?.nonRootRequired === true, 'fabric sandbox must require non-root execution');
  expect(fabric.sandbox?.process?.dropAllCapabilities === true, 'fabric sandbox must drop all capabilities');
  expect(fabric.sandbox?.process?.noNewPrivileges === true, 'fabric sandbox must set no-new-privileges');

  expect(architecture.generation === 10, 'architecture must remain Generation 10');
  expect(architecture.mandatoryExecutionBoundary?.allMutatingEngineeringWorkRequiresExecutionFabric === true, 'architecture must mandate the execution fabric for mutations');
  expect(architecture.mandatoryExecutionBoundary?.mergeRequiresVirtualizedExecutionGate === true, 'merge must require a virtualized execution gate');
  expect(architecture.operatingModel?.providerIndependent === true, 'architecture must remain provider independent');
  expect(architecture.runtimeEvidence?.nonProductionIsolatedExecutionProven === true, 'initial non-production isolated execution evidence must be recorded');
  expect(architecture.runtimeEvidence?.autonomousProductionReadinessProven === false, 'production readiness must not be claimed prematurely');
  expect(architecture.activation?.currentState === 'nonproduction_runtime_proven_activation_incomplete', 'activation state must reflect partial runtime proof only');

  expect(evidence.workflow?.runId === policy.evidence?.initialProofRunId, 'initial proof run id must match policy evidence');
  expect(evidence.artifact?.digest === policy.evidence?.initialProofArtifactDigest, 'initial proof artifact digest must match policy evidence');
  expect(evidence.claimBoundary?.nonProductionIsolatedExecutionProven === true, 'evidence must prove non-production isolated execution');
  expect(evidence.claimBoundary?.autonomousProductionReadinessProven === false, 'evidence must not claim production readiness');
}

if (failures.length) {
  console.error('[EKODI][EXEC-FABRIC-001] virtualized execution policy validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[EKODI][EXEC-FABRIC-001] virtualized execution policy validated.');
console.log('[EKODI][EXEC-FABRIC-001] all mutating engineering work is required to pass the provider-independent execution fabric.');
console.log('[EKODI][EXEC-FABRIC-001] autonomous production readiness remains intentionally unclaimed.');
