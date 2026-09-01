import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => {
  console.error(`❌ Cognitive Control Plane: ${message}`);
  process.exitCode = 1;
};

const contractFile = 'config/cognitive-control-plane.json';
const dataContractFile = 'config/data-plane-contract.json';
const runtimeFile = 'cognitive-control-plane.js';
const workflowFile = '.github/workflows/deploy-ai-control.yml';
const manifestFile = 'deploy/manifests/ai-control.worker.json';

for (const file of [contractFile, dataContractFile, runtimeFile, workflowFile, manifestFile]) {
  if (!fs.existsSync(path.join(root, file))) fail(`required file is missing: ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const contract = JSON.parse(read(contractFile));
const dataContract = JSON.parse(read(dataContractFile));
const manifest = JSON.parse(read(manifestFile));
const runtime = read(runtimeFile);
const workflow = read(workflowFile);

if (contract.status !== 'enforced-foundation') fail('contract status must be enforced-foundation');
for (const plane of ['control', 'governance', 'execution', 'data']) {
  if (!contract.planes?.[plane]) fail(`missing plane: ${plane}`);
}
for (const environment of ['development', 'verification', 'production']) {
  if (!contract.environments?.[environment]) fail(`missing environment: ${environment}`);
}
if (contract.environments?.development?.productionData !== false) fail('development must explicitly forbid production data');
if (contract.environments?.production?.directMutation !== false) fail('production directMutation must remain false');
if (contract.environments?.production?.promotionOnly !== true) fail('production must be promotion-only');
if (contract.promotion?.rebuildOnPromotion !== false) fail('production promotion must not rebuild the verified artifact');
if (contract.promotion?.immutableArtifactRequired !== true) fail('immutable artifact identity must be required');
if (contract.planes?.data?.contract !== dataContractFile) fail('data plane must delegate storage/traffic boundaries to config/data-plane-contract.json');
if (dataContract.accountProfiles?.development?.productionDataAllowed !== false) fail('data-plane development profile must forbid production data');

const requiredGates = [
  'source-isolation',
  'build',
  'tests',
  'security',
  'policy',
  'staging-smoke',
  'artifact-identity',
  'release-authorization',
  'audit',
];
const configuredGates = new Set(contract.promotion?.requiredGates || []);
for (const gate of requiredGates) if (!configuredGates.has(gate)) fail(`missing production promotion gate: ${gate}`);

for (const marker of [
  "productionMutationMode: 'promotion-only'",
  "rebuildOnPromotion: false",
  "'direct_production_mutation_forbidden'",
  "'governance_authorization_required'",
  "'promotion_gates_incomplete'",
]) {
  if (!runtime.includes(marker)) fail(`runtime is missing enforcement marker: ${marker}`);
}

for (const marker of [
  'deploy-staging:',
  'environment: development',
  'needs: deploy-staging',
  'guarded-worker-release.mjs --manifest deploy/manifests/ai-control.worker.json --secrets-file /tmp/ai-control-secrets.json',
  'validate-cognitive-control-plane.mjs',
  'test/cognitive-control-plane.test.mjs',
]) {
  if (!workflow.includes(marker)) fail(`AI Control workflow is missing governance marker: ${marker}`);
}
for (const forbidden of [
  'wrangler@4.119.0 deploy --config wrangler.ai.toml',
  'secret put "$name" --config wrangler.ai.toml',
  'npm run deploy:ai-control',
]) {
  if (workflow.includes(forbidden)) fail(`AI Control workflow contains a direct production bypass: ${forbidden}`);
}

if (manifest.worker?.allowFirstDeploy !== true) fail('first production bootstrap must be owned by the guarded release controller');
if (manifest.worker?.config !== 'wrangler.ai.toml') fail('AI Control production artifact must have one canonical Worker config');
if (!Array.isArray(manifest.worker?.requests) || manifest.worker.requests.length < 3) fail('AI Control manifest must verify UI, config and API status');

if (process.exitCode) {
  console.error('Cognitive Control Plane policy audit failed closed.');
  process.exit(process.exitCode);
}
console.log('✅ Cognitive Control Plane policy audit passed: four planes, isolated environments and immutable guarded production promotion are enforced.');
