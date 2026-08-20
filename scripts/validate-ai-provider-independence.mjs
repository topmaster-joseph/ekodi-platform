import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let failed = false;

function fail(file, message) {
  console.error(`❌ ${file}: ${message}`);
  failed = true;
}

function requireText(file, needles) {
  const text = read(file);
  for (const needle of needles) if (!text.includes(needle)) fail(file, `missing required resilience marker: ${needle}`);
  return text;
}

const contractFile = 'config/ai-provider-independence.json';
const contract = JSON.parse(read(contractFile));

if (contract?.scope?.includeAllEkodiSurfaces !== true) fail(contractFile, 'policy must apply to all EKODI surfaces');
if (contract?.defaultPolicy?.providerRequiredForCoreService !== false) fail(contractFile, 'core service must never require an AI provider');
if (contract?.defaultPolicy?.providerFailureMustNotFailCoreRequest !== true) fail(contractFile, 'provider failure must not fail the core request');
if (contract?.defaultPolicy?.providerSecretsAllowedInBrowser !== false) fail(contractFile, 'provider secrets must never be browser-side');
if (contract?.defaultPolicy?.fallbackMode !== 'free_assist') fail(contractFile, 'first fallback must be free_assist');
if (contract?.defaultPolicy?.finalFallbackMode !== 'core') fail(contractFile, 'final fallback must be core');
if (contract?.releaseGate?.requiredEnvironment !== 'AI_PROVIDER=NONE') fail(contractFile, 'release gate must explicitly test AI_PROVIDER=NONE');
if (contract?.releaseGate?.blockProductionOnFailure !== true) fail(contractFile, 'failed no-provider gate must block production');

const requiredSurfaces = ['root','auth','admin','my','marketing','creator','community','work','energy','insurance','publishing','books','business','church','social','mall'];
const surfaces = new Set(contract?.scope?.surfaces || []);
for (const surface of requiredSurfaces) if (!surfaces.has(surface)) fail(contractFile, `missing governed surface: ${surface}`);

const runtimeFile = 'ai-resilience-runtime.js';
requireText(runtimeFile, [
  'providerIndependentCore: true',
  'isAiProviderDisabled',
  'runAiEnhancedTask',
  "mode: 'free_assist'",
  "mode: 'core'",
  'AI_PROVIDER_TIMEOUT',
]);

const coreGatewayFile = 'core-ai-gateway.js';
requireText(coreGatewayFile, [
  'buildCoreAiGateway',
  'runAiEnhancedTask',
  'requires a non-AI fallback',
  'providerIndependent: true',
  'aiOptional: true',
]);

const coreApiFile = 'core-api.js';
requireText(coreApiFile, [
  '/ai/status',
  'getCoreAiGatewayStatus',
  'ai-optional',
]);

const packageFile = 'package.json';
const packageJson = JSON.parse(read(packageFile));
if (!String(packageJson.scripts?.['validate:ai-resilience'] || '').includes('validate-ai-provider-independence.mjs')) {
  fail(packageFile, 'validate:ai-resilience script is required');
}
if (!String(packageJson.scripts?.['test:ai-none'] || '').includes('ai-provider-none.test.mjs')) {
  fail(packageFile, 'test:ai-none script is required');
}
if (!String(packageJson.scripts?.check || '').includes('validate:ai-resilience')) {
  fail(packageFile, 'npm run check must include the provider-independence audit');
}

const ciFile = '.github/workflows/ci.yml';
requireText(ciFile, ['AI_PROVIDER: NONE', 'npm run test:ai-none', 'npm run validate:ai-resilience']);

for (const releaseFile of ['scripts/guarded-worker-release.mjs', 'scripts/guarded-pages-release.mjs']) {
  requireText(releaseFile, [
    'runProviderIndependenceGate',
    "AI_PROVIDER: 'NONE'",
    'validate-ai-provider-independence.mjs',
    'ai-provider-none.test.mjs',
  ]);
}

const governanceFile = 'ai-governance-runtime.js';
requireText(governanceFile, [
  'no_ai_provider_dependency_for_core_service',
  'provider_failure_must_degrade_not_disable_service',
]);

const authorAiFile = 'supabase/functions/author-ai-api/index.ts';
requireText(authorAiFile, [
  'free_assist',
  'provider_unavailable',
  '기본 모드로 계속 이용할 수 있습니다',
]);

if (failed) {
  console.error('AI provider-independence audit failed. Production must remain blocked until core service survives AI_PROVIDER=NONE.');
  process.exit(1);
}

console.log('✅ AI provider-independence audit passed: every EKODI surface is governed by Service-first, AI-enhanced release policy and guarded promotion.');
