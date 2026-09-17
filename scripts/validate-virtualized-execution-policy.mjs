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
  expect(fabric.executionBoundary?.singleExecutorMayNotOwnControlAuthority === true, 'single executor must not own control authority');
  expect(fabric.orchestration?.owner === 'ekodi-orchestrator', 'EKODI Orchestrator must own execution coordination');
  expect(fabric.orchestration?.mode === 'parallel-multi-method-independent-evidence-convergence', 'fabric must use parallel multi-method convergence');
  expect(fabric.orchestration?.virtualizationOnly === false, 'execution fabric must not be virtualization-only');
  expect(fabric.orchestration?.virtualizedIsolationLaneRequiredForMutatingEngineeringWork === true, 'mutating engineering work must retain a virtualized isolation lane');
  expect(Number(fabric.orchestration?.minimumIndependentLanes) >= 2, 'fabric must require at least two independent lanes');
  expect(Number(fabric.orchestration?.minimumIndependentMethodClasses) >= 2, 'fabric must require at least two independent method classes');
  expect(Number(fabric.orchestration?.maxConcurrentAtS0) >= 2, 'S0 must support at least two concurrent evidence lanes');
  const provenMethods = (fabric.orchestration?.methodCatalog || []).filter(item => item.state === 'runtime-proven');
  expect(provenMethods.length >= 2, 'at least two method catalog entries must be runtime-proven');
  expect(new Set(provenMethods.map(item => item.methodClass)).size >= 2, 'runtime-proven methods must represent distinct method classes');
  expect(fabric.orchestration?.convergence?.requireComparableEvidenceDigest === true, 'parallel convergence must compare evidence digests');
  expect(fabric.orchestration?.convergence?.productionPromotion === 'central-release-gateway-only', 'execution lanes must not own production promotion');
  expect(fabric.sandbox?.process?.nonRootRequired === true, 'fabric sandbox must require non-root execution');
  expect(fabric.sandbox?.process?.dropAllCapabilities === true, 'fabric sandbox must drop all capabilities');
  expect(fabric.sandbox?.process?.noNewPrivileges === true, 'fabric sandbox must set no-new-privileges');
  expect(Number(fabric.sandbox?.maxConcurrentAtS0) >= 2, 'fabric sandbox capacity must permit the S0 two-lane proof');
  expect(fabric.promotion?.parallelIndependentEvidenceRequired === true, 'promotion must require parallel independent evidence');
  expect(Number(fabric.promotion?.minimumIndependentEvidenceSources) >= 2, 'promotion requires at least two evidence sources');

  expect(architecture.generation === 10, 'architecture must remain Generation 10');
  expect(architecture.mandatoryExecutionBoundary?.allMutatingEngineeringWorkRequiresExecutionFabric === true, 'architecture must mandate the execution fabric for mutations');
  expect(architecture.mandatoryExecutionBoundary?.mergeRequiresVirtualizedExecutionGate === true, 'merge must retain a virtualized isolation gate');
  expect(architecture.mandatoryExecutionBoundary?.mergeRequiresParallelIndependentEvidenceGate === true, 'merge must also require parallel independent evidence');
  expect(architecture.operatingModel?.providerIndependent === true, 'architecture must remain provider independent');
  expect(architecture.operatingModel?.virtualizationOnly === false, 'architecture must not be virtualization-only');
  expect(architecture.parallelExecution?.orchestrationOwner === 'ekodi-orchestrator', 'architecture must assign orchestration to EKODI Orchestrator');
  expect(architecture.parallelExecution?.virtualizationIsOneMethodNotTheArchitecture === true, 'architecture must define virtualization as one method');
  expect(architecture.runtimeEvidence?.nonProductionIsolatedExecutionProven === true, 'initial non-production isolated execution evidence must be recorded');
  expect(architecture.runtimeEvidence?.parallelMultiMethodRuntimeProofRequired === true, 'parallel multi-method runtime evidence must be required');
  expect(architecture.runtimeEvidence?.autonomousProductionReadinessProven === false, 'production readiness must not be claimed prematurely');
  expect(architecture.activation?.currentState === 'nonproduction_runtime_proven_activation_incomplete', 'activation state must reflect partial runtime proof only');

  expect(evidence.workflow?.runId === policy.evidence?.initialProofRunId, 'initial proof run id must match policy evidence');
  expect(evidence.artifact?.digest === policy.evidence?.initialProofArtifactDigest, 'initial proof artifact digest must match policy evidence');
  expect(evidence.claimBoundary?.nonProductionIsolatedExecutionProven === true, 'evidence must prove non-production isolated execution');
  expect(evidence.claimBoundary?.autonomousProductionReadinessProven === false, 'evidence must not claim production readiness');
}

if (failures.length) {
  console.error('[EKODI][EXEC-FABRIC-001] execution fabric isolation and parallel-orchestration policy validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[EKODI][EXEC-FABRIC-001] virtualized isolation policy validated as a mandatory safety lane.');
console.log('[EKODI][EXEC-FABRIC-001] EKODI Orchestrator requires parallel independent execution methods; the architecture is not virtualization-only.');
console.log('[EKODI][EXEC-FABRIC-001] autonomous production readiness remains intentionally unclaimed.');
