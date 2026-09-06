import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);

const architectureFile = 'governance/architecture/ekodi-os-architecture.json';
const boundariesFile = 'platform-boundaries.json';
const capabilityContractFile = 'governance/architecture/capability-provider-contract.v1.json';
const evolutionFile = 'governance/architecture/ekodi-evolution-model.json';
const architecture = readJson(architectureFile);
const boundaries = readJson(boundariesFile);
const capabilityContract = readJson(capabilityContractFile);
const evolution = readJson(evolutionFile);
const core = readJson('config/ekodi-core-contract.json');
const workspacePolicy = readJson('config/service-workspace-policy.json');

if (architecture.schemaVersion !== 1) fail('architecture schemaVersion must be 1');
if (architecture.status !== 'active') fail('architecture registry must be active');
if (architecture.principle !== 'Integrated responsibility, distributed execution, standardized connections.') {
  fail('canonical architecture principle mismatch');
}
if (architecture.principleKo !== '통합된 책임, 분산된 실행, 표준화된 연결.') {
  fail('canonical Korean architecture principle mismatch');
}
if (architecture.deploymentTopology !== 'modular-monolith-first') {
  fail('modular-monolith-first must remain the default deployment topology');
}

const requiredLayers = [
  'governance',
  'os',
  'core',
  'responsible-independent-service',
  'external-connected-service',
  'workspace',
];
for (const layer of requiredLayers) {
  if (!architecture.layers?.[layer]) fail(`missing architecture layer: ${layer}`);
}

for (const responsibility of ['ekodi-responsible', 'external-provider-responsible']) {
  if (!architecture.responsibilityClasses?.[responsibility]) fail(`missing responsibility class: ${responsibility}`);
}

const platforms = boundaries.platforms || {};
const classifications = architecture.platformBoundaryClassification || {};
const platformIds = Object.keys(platforms).sort();
const classifiedIds = Object.keys(classifications).sort();
for (const id of platformIds) {
  const classification = classifications[id];
  if (!classification) {
    fail(`platform boundary is not architecture-classified: ${id}`);
    continue;
  }
  if (!requiredLayers.includes(classification.layer)) fail(`${id}: unknown architecture layer ${classification.layer}`);
  if (classification.layer === 'governance' || classification.layer === 'external-connected-service') {
    fail(`${id}: EKODI deployment boundary cannot be classified as ${classification.layer}`);
  }
  if (classification.responsibilityClass !== 'ekodi-responsible') {
    fail(`${id}: EKODI deployment boundary must remain EKODI-responsible`);
  }
  if (!classification.capability) fail(`${id}: capability is required`);
}
for (const id of classifiedIds) {
  if (!platforms[id]) fail(`architecture classification references unknown platform boundary: ${id}`);
}

const external = architecture.externalConnectedServices || {};
if (Object.keys(external).length === 0) fail('at least one external connected service family must be registered');
for (const [id, service] of Object.entries(external)) {
  if (service.responsibilityClass !== 'external-provider-responsible') {
    fail(`${id}: external connected service must use external-provider-responsible`);
  }
  if (!service.family) fail(`${id}: external connected service family is required`);
  if (!service.connection) fail(`${id}: external connected service connection contract is required`);
  if (!service.dataRule) fail(`${id}: external connected service dataRule is required`);
}

const marketingAi = architecture.capabilityRouting?.['marketing-ai'];
if (!marketingAi) fail('marketing-ai capability routing policy is required');
else {
  if (marketingAi.mode !== 'multi-implementation-selectable') fail('marketing-ai must support selectable multiple implementations');
  if (marketingAi.ekodiImplementation !== 'marketing-ai') fail('marketing-ai EKODI implementation must map to the registered marketing-ai boundary');
  if (marketingAi.externalImplementationsAllowed !== true) fail('marketing-ai must allow compatible external implementations');
  if (marketingAi.parallelUseAllowed !== true) fail('marketing-ai must allow parallel compatible implementations');
  if (marketingAi.directPrivateDatabaseAccessForExternalImplementations !== false) fail('external marketing-ai implementations must not receive direct private database access');
  for (const authority of ['user', 'workspace-admin', 'ekodi-orchestrator-policy']) {
    if (!marketingAi.selectionAuthorities?.includes(authority)) fail(`marketing-ai selection authority missing: ${authority}`);
  }
}

const workspace = architecture.workspaceRules || {};
if (workspace.identityKey !== 'workspace_id') fail('workspace identity must remain immutable workspace_id');
if (workspace.urlIsIdentity !== false) fail('workspace URL must not become identity authority');
if (workspace.workspaceKindIsIdentity !== false) fail('workspace kind must not become identity authority');
if (workspace.workspaceOwnsServiceSelection !== true) fail('workspace must own compatible service selection');
if (workspace.serviceDisconnectMustPreserveWorkspaceIdentity !== true) fail('service disconnection must preserve workspace identity');

const workspaceSelection = workspacePolicy.serviceImplementationSelection || {};
if (workspacePolicy.publicWorkspaceRouting?.workspaceIdentityKey !== 'workspace_id') fail('workspace policy must keep workspace_id authority');
if (workspaceSelection.workspaceMaySelectCompatibleImplementation !== true) fail('workspace policy must allow compatible implementation selection');
if (workspaceSelection.externalImplementationRequiresStandardContract !== true) fail('workspace policy must require standard contracts for external implementations');
if (workspaceSelection.externalImplementationDirectPrivateDatabaseAccess !== false) fail('workspace policy must forbid direct private database access for external implementations');
if (workspaceSelection.disconnectPreservesWorkspaceIdentity !== true) fail('workspace policy must preserve identity after implementation disconnect');
for (const authority of ['user', 'workspace-admin', 'ekodi-orchestrator-policy']) {
  if (!workspaceSelection.selectionAuthorities?.includes(authority)) fail(`workspace selection authority missing: ${authority}`);
}

if (core.architectureAlignment?.layer !== 'core') fail('EKODI Core must declare the core architecture layer');
if (core.architectureAlignment?.responsibilityClass !== 'ekodi-responsible') fail('EKODI Core must remain EKODI-responsible');
if (core.architectureAlignment?.architectureRegistry !== architectureFile) fail('EKODI Core architecture registry path mismatch');
if (core.architectureAlignment?.deploymentTopologyIndependent !== true) fail('Core responsibility boundaries must be deployment-topology independent');
if (core.serviceConnectionModel?.crossBoundaryContractRequired !== true) fail('Core must require cross-boundary contracts');
if (core.serviceConnectionModel?.directPrivateDatabaseCouplingAcrossIndependentServices !== false) fail('Core must forbid direct private database coupling across independent services');
if (core.serviceConnectionModel?.externalConnectionsUseReviewedAdaptersOrContracts !== true) fail('Core must require reviewed external adapters/contracts');
if (core.serviceConnectionModel?.safeDisconnectionRequired !== true) fail('Core must require safe disconnection');

if (capabilityContract.schemaVersion !== 1) fail('capability provider contract schemaVersion must be 1');
if (capabilityContract.contractId !== 'ekodi.capability-provider.v1') fail('capability provider contract id mismatch');
if (capabilityContract.status !== 'active') fail('capability provider contract must be active');
for (const providerType of ['ekodi-responsible', 'external-provider-responsible']) {
  if (!capabilityContract.providerTypes?.includes(providerType)) fail(`capability contract provider type missing: ${providerType}`);
}
if (capabilityContract.authorization?.workspaceAuthority !== 'ekodi') fail('capability contract must preserve EKODI workspace authority');
if (capabilityContract.authorization?.directPrivateDatabaseAccessForExternalProviders !== false) fail('capability contract must forbid direct private DB access for external providers');
if (capabilityContract.selection?.compatibleImplementationsMayCoexist !== true) fail('capability contract must allow compatible implementations to coexist');

const connectionRules = architecture.connectionRules || [];
const requiredConnectionRules = [
  'Cross-boundary access uses a public or explicitly declared contract.',
  'Direct private database coupling across responsible independent service boundaries is forbidden.',
];
for (const rule of requiredConnectionRules) {
  if (!connectionRules.includes(rule)) fail(`missing connection rule: ${rule}`);
}

// Sustainable evolution and fragmentation guard.
if (evolution.schemaVersion !== 1) fail('evolution model schemaVersion must be 1');
if (evolution.status !== 'active') fail('evolution model must be active');
if (evolution.currentGeneration !== 2) fail('current EKODI generation must remain Generation 2 until a constitutional promotion');
if (evolution.northStarGeneration !== 8 || evolution.northStarName !== 'Living Digital Commons') {
  fail('EKODI north star must remain Generation 8 Living Digital Commons');
}
if (evolution.currentScaleTier !== 'S0') fail('current sustainable scale tier must remain S0 until an approved promotion');
const generations = evolution.generations || [];
if (generations.length !== 8) fail('evolution model must define exactly eight generations');
for (let generation = 1; generation <= 8; generation += 1) {
  if (!generations.some(item => item.generation === generation)) fail(`evolution generation missing: ${generation}`);
}
if (evolution.sustainability?.defaultDeploymentTopology !== 'modular-monolith-first') fail('evolution model must preserve modular-monolith-first');
if (evolution.sustainability?.noSpeculativeScale !== true) fail('speculative capacity scaling must be forbidden');
if (evolution.sustainability?.noSpeculativeServiceSplit !== true) fail('speculative service splitting must be forbidden');
if (evolution.sustainability?.sharedBeforeDedicated !== true) fail('shared infrastructure must be preferred before dedicated infrastructure');
if (evolution.sustainability?.reuseCapabilityBeforeNewService !== true) fail('capability reuse must be evaluated before a new service');
const tiers = evolution.scaleTiers || [];
for (const tier of ['S0', 'S1', 'S2', 'S3']) {
  if (!tiers.some(item => item.tier === tier)) fail(`sustainable scale tier missing: ${tier}`);
}
const gate = evolution.boundaryCreationGate || {};
if (gate.defaultDecision !== 'reuse-existing-capability-or-shared-runtime') fail('new-boundary default decision must be reuse/shared runtime');
if (gate.grandfatherExistingBoundaries !== true) fail('existing deployment boundaries must be grandfathered during convergence');
const grandfathered = new Set(gate.grandfatheredDeploymentBoundaries || []);
const approvedExceptions = new Map((gate.approvedExpansionExceptions || []).map(item => [item.id, item]));
for (const id of platformIds) {
  if (grandfathered.has(id)) continue;
  const exception = approvedExceptions.get(id);
  if (!exception) {
    fail(`${id}: new deployment boundary lacks approved sustainable expansion evidence`);
    continue;
  }
  for (const key of ['reason', 'expectedBenefit', 'incrementalMonthlyCost', 'rollbackPath', 'owner', 'observabilityPlan']) {
    if (!exception[key]) fail(`${id}: approved expansion exception missing ${key}`);
  }
}
if (evolution.workspaceConvergence?.canonicalIdentity !== 'workspace_id') fail('evolution model must preserve workspace_id authority');
if (evolution.workspaceConvergence?.canonicalTerm !== 'Workspace') fail('Workspace must be the canonical operating-context term');
if (!evolution.workspaceConvergence?.legacyTerms?.includes('Space')) fail('legacy Space migration term must remain explicitly tracked');
if (evolution.workspaceConvergence?.target !== 'Person + Workspace + Membership + Capability') fail('workspace convergence target mismatch');
if (evolution.promotionRule?.generationAdvancementIsNotDateDriven !== true) fail('generation advancement must be evidence-driven, not date-driven');

if (failures.length) {
  console.error(`EKODI OS architecture validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log('EKODI OS architecture: OK');
console.log(`- ${platformIds.length} EKODI deployment boundaries classified`);
console.log(`- ${Object.keys(external).length} external connected service families registered`);
console.log(`- sustainable evolution: generation ${evolution.currentGeneration} -> north star ${evolution.northStarGeneration}, scale ${evolution.currentScaleTier}`);
console.log('- existing deployment boundaries frozen as convergence baseline; new boundaries require evidence');
console.log('- Core, Workspace and capability-provider contracts aligned');
console.log('- responsibility: integrated; execution: distributed; connections: standardized');
