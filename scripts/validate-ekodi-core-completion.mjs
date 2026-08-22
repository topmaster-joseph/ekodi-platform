import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = file => JSON.parse(read(file));
let failed = false;

function fail(file, message) {
  console.error(`❌ ${file}: ${message}`);
  failed = true;
}
function requireText(file, needles) {
  const text = read(file);
  for (const needle of needles) if (!text.includes(needle)) fail(file, `missing completion marker: ${needle}`);
  return text;
}

const completionFile = 'config/ekodi-core-completion.json';
const coreFile = 'config/ekodi-core-contract.json';
const completion = readJson(completionFile);
const core = readJson(coreFile);

if (completion.status !== 'completed') fail(completionFile, 'status must be completed');
if (completion.coreVersion !== '1.0.0') fail(completionFile, 'coreVersion must be 1.0.0');
if (!Array.isArray(completion.stages) || completion.stages.length !== 7) fail(completionFile, 'exactly seven completion stages are required');
for (let stage = 1; stage <= 7; stage += 1) {
  const row = completion.stages.find(item => Number(item.stage) === stage);
  if (!row || row.status !== 'completed') fail(completionFile, `stage ${stage} must be completed`);
}

const requiredGates = [
  ...(core.completionGates || []),
  'production-core-api-contract-is-live',
  'protected-core-routes-fail-closed-without-auth',
  'bounded-production-load-test-passes',
  'automatic-worker-rollback-contract-is-enforced',
  'd1-recovery-point-is-captured-before-control-release',
  'security-baseline-is-enforced',
];
for (const gate of requiredGates) {
  if (completion.gates?.[gate] !== true) fail(completionFile, `completion gate is not true: ${gate}`);
}

for (const file of [
  'core-api.js',
  'core-ai-gateway.js',
  'core-client.js',
  'ekodi-principal.js',
  'scripts/verify-ekodi-core-production.mjs',
  '.github/workflows/verify-ekodi-core-completion.yml',
  '.github/workflows/backup-ekodi-core.yml',
  '.github/workflows/deploy-control-api.yml',
]) {
  if (!fs.existsSync(path.join(root, file))) fail(file, 'required completion asset is missing');
}

requireText('scripts/guarded-worker-release.mjs', [
  'previousVersion',
  'Rolling back',
  'Automatic rollback verified',
  "AI_PROVIDER: 'NONE'",
]);
requireText('.github/workflows/deploy-control-api.yml', [
  'Capture production D1 recovery bookmark',
  'd1 time-travel info ekodi-auth',
  'Guarded 0-percent Control candidate then promote',
  'Verify production Control and universal membership boundaries',
]);
requireText('.github/workflows/backup-ekodi-core.yml', [
  'ekodi-auth-staging',
  "'ekodi-auth'",
  'sqlite3 backup/restored.sqlite',
  'PRAGMA integrity_check',
  'actions/upload-artifact@v4',
]);
requireText('.github/workflows/ci.yml', [
  'AI_PROVIDER: NONE',
  'npm run test:ai-none',
  'npm run validate:ai-resilience',
]);
requireText('scripts/verify-ekodi-core-production.mjs', [
  '/api/core/v1/status',
  '/api/core/v1/roles',
  '/api/core/v1/ai/status',
  '/api/core/v1/recovery/status',
  'strict-transport-security',
]);

const packageJson = readJson('package.json');
if (!String(packageJson.scripts?.['validate:core-completion'] || '').includes('validate-ekodi-core-completion.mjs')) {
  fail('package.json', 'validate:core-completion script is required');
}
if (!String(packageJson.scripts?.['verify:core-production'] || '').includes('verify-ekodi-core-production.mjs')) {
  fail('package.json', 'verify:core-production script is required');
}

if (failed) {
  console.error('EKODI Core completion validation failed. Completion must not be declared while a gate is missing.');
  process.exit(1);
}
console.log(`✅ EKODI Core ${completion.coreVersion} completion contract validated: 7/7 stages and ${requiredGates.length} enforced gates.`);