import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''));
const failures = [];
const fail = message => failures.push(message);

const architectureFile = 'governance/architecture/ekodi-os-architecture.json';
const boundariesFile = 'platform-boundaries.json';
const architecture = readJson(architectureFile);
const boundaries = readJson(boundariesFile);

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

const connectionRules = architecture.connectionRules || [];
const requiredConnectionRules = [
  'Cross-boundary access uses a public or explicitly declared contract.',
  'Direct private database coupling across responsible independent service boundaries is forbidden.',
];
for (const rule of requiredConnectionRules) {
  if (!connectionRules.includes(rule)) fail(`missing connection rule: ${rule}`);
}

if (failures.length) {
  console.error(`EKODI OS architecture validation failed (${failures.length})`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log('EKODI OS architecture: OK');
console.log(`- ${platformIds.length} EKODI deployment boundaries classified`);
console.log(`- ${Object.keys(external).length} external connected service families registered`);
console.log('- responsibility: integrated; execution: distributed; connections: standardized');
