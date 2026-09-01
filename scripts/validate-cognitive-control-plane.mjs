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
const buildScriptFile = 'scripts/build-ai-control-release.mjs';
const buildConfigFile = 'wrangler.ai.build.toml';
const stagingReleaseConfigFile = 'wrangler.ai.staging.release.toml';
const productionReleaseConfigFile = 'wrangler.ai.release.toml';

for (const file of [
  contractFile,
  dataContractFile,
  runtimeFile,
  workflowFile,
  manifestFile,
  buildScriptFile,
  buildConfigFile,
  stagingReleaseConfigFile,
  productionReleaseConfigFile,
]) {
  if (!fs.existsSync(path.join(root, file))) fail(`required file is missing: ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const contract = JSON.parse(read(contractFile));
const dataContract = JSON.parse(read(dataContractFile));
const manifest = JSON.parse(read(manifestFile));
const runtime = read(runtimeFile);
const workflow = read(workflowFile);
const buildScript = read(buildScriptFile);
const stagingReleaseConfig = read(stagingReleaseConfigFile);
const productionReleaseConfig = read(productionReleaseConfigFile);

if (contract.status !== 'enforced-foundation') fail('contract status must be enforced-foundation');
for (const plane of ['control', 'governance', 'execution', 'data']) {
  if (!contract.planes?.[plane]) fail(`missing plane: ${plane}`);
}
for (const environment of ['development', 'verification', 'production']) {
  if (!contract.environments?.[environment]) fail(`missing environment: ${environment}`);
}
if (contract.environments?.development?.productionData !== false) fail('development must explicitly forbid production data');
if (contract.environments?.production?.directMutation !== false) fail('production directMutation must remain false');
if (contract.environments?.production?.promotionOnly !== true) fail('production application runtime must be promotion-only');
if (contract.environments?.production?.dataSchemaMutation !== 'governed-additive-migration-only') fail('production data schema mutation must use the governed additive migration lane');
if (contract.promotion?.buildOnce !== true) fail('application artifact must be built exactly once per release run');
if (contract.promotion?.rebuildOnPromotion !== false) fail('production promotion must not rebuild the verified artifact');
if (contract.promotion?.immutableArtifactRequired !== true) fail('immutable artifact identity must be required');
if (contract.planes?.data?.contract !== dataContractFile) fail('data plane must delegate storage/traffic boundaries to config/data-plane-contract.json');
if (contract.planes?.data?.productionSchemaMutation !== 'governed-additive-migration-only') fail('data plane must explicitly constrain production schema mutation');
if (dataContract.accountProfiles?.development?.productionDataAllowed !== false) fail('data-plane development profile must forbid production data');
if (contract.migration?.productionDataCopyToDevelopment !== false) fail('production data copy to development must remain forbidden by default');

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

const requiredMigrationGates = [
  'additive-schema-validation',
  'verification',
  'staging-smoke',
  'recovery-point',
  'release-authorization',
  'audit',
];
const configuredMigrationGates = new Set(contract.migration?.requiredGates || []);
for (const gate of requiredMigrationGates) if (!configuredMigrationGates.has(gate)) fail(`missing production migration gate: ${gate}`);

for (const marker of [
  "productionMutationMode: 'promotion-only'",
  "productionDataSchemaMode: 'governed-additive-migration-only'",
  "rebuildOnPromotion: false",
  "'direct_production_mutation_forbidden'",
  "'governance_authorization_required'",
  "'promotion_gates_incomplete'",
  "'governed_additive_migration'",
  "'migration_gates_incomplete'",
]) {
  if (!runtime.includes(marker)) fail(`runtime is missing enforcement marker: ${marker}`);
}

for (const marker of [
  'deploy-staging:',
  'environment: development',
  'needs: [validate, deploy-staging]',
  'Build one immutable AI Control application artifact',
  'actions/upload-artifact@v4',
  'actions/download-artifact@v5',
  'EXPECTED_AI_ARTIFACT_DIGEST',
  'wrangler.ai.staging.release.toml',
  'Capture production D1 recovery bookmark',
  'validate-additive-migrations.mjs migrations',
  'apply-d1-migrations-with-retry.sh ekodi-auth wrangler.ai.release.toml',
  'guarded-worker-release.mjs --manifest deploy/manifests/ai-control.worker.json --secrets-file /tmp/ai-control-secrets.json',
  'validate-cognitive-control-plane.mjs',
  'test/cognitive-control-plane.test.mjs',
]) {
  if (!workflow.includes(marker)) fail(`AI Control workflow is missing governance marker: ${marker}`);
}
for (const forbidden of [
  'deploy --config wrangler.ai.toml',
  'deploy --config wrangler.ai.staging.toml',
  'secret put "$name" --config wrangler.ai.toml',
  'npm run deploy:ai-control',
]) {
  if (workflow.includes(forbidden)) fail(`AI Control workflow contains a source-rebuild or direct-production bypass: ${forbidden}`);
}

for (const [label, config] of [
  ['staging release', stagingReleaseConfig],
  ['production release', productionReleaseConfig],
]) {
  if (!config.includes('main = ".release/ai-control/worker.js"')) fail(`${label} config must point at the prebuilt Worker bundle`);
  if (!config.includes('no_bundle = true')) fail(`${label} config must disable deployment-time rebundling`);
  if (!config.includes('directory = "./.release/ai-control/assets"')) fail(`${label} config must use the promoted static asset directory`);
}
if (!/["']deploy["']\s*,[\s\S]{0,160}?["']--dry-run["']\s*,[\s\S]{0,160}?["']--outdir["']/.test(buildScript)) fail('artifact builder must use Wrangler dry-run output rather than deploying source');
if (!buildScript.includes('artifactDigest')) fail('artifact builder must record an aggregate artifact digest');
if (!buildScript.includes('EXPECTED_AI_ARTIFACT_DIGEST')) fail('artifact verification must compare the expected promotion digest');

if (manifest.worker?.allowFirstDeploy !== true) fail('first production bootstrap must be owned by the guarded release controller');
if (manifest.worker?.config !== productionReleaseConfigFile) fail('AI Control production manifest must consume the immutable release config');
if (!Array.isArray(manifest.worker?.requests) || manifest.worker.requests.length < 3) fail('AI Control manifest must verify UI, config and API status');

if (process.exitCode) {
  console.error('Cognitive Control Plane policy audit failed closed.');
  process.exit(process.exitCode);
}
console.log('✅ Cognitive Control Plane policy audit passed: four planes, one immutable application artifact and governed additive production migrations are enforced.');
