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
  for (const needle of needles) if (!text.includes(needle)) fail(file, `missing required guard marker: ${needle}`);
  return text;
}
function forbidText(file, needles) {
  const text = read(file);
  for (const needle of needles) if (text.includes(needle)) fail(file, `unsafe production bypass detected: ${needle}`);
  return text;
}

const workerGuarded = {
  '.github/workflows/deploy-site-core.yml': ['guarded-worker-release.mjs', 'shared-site.worker.json'],
  '.github/workflows/deploy-books.yml': ['guarded-worker-release.mjs', 'books.worker.json'],
  '.github/workflows/deploy-community.yml': ['guarded-worker-release.mjs', 'community.worker.json'],
  '.github/workflows/deploy-social.yml': ['guarded-worker-release.mjs', 'social.worker.json'],
  '.github/workflows/deploy-life-ai.yml': ['guarded-worker-release.mjs', 'life.worker.json'],
};
for (const [file, needles] of Object.entries(workerGuarded)) requireText(file, needles);

// The shared ekodi.kr/admin/auth/mall runtime has exactly one production writer.
// deploy-site-core.yml is the only workflow allowed to write the shared Worker.
// A narrowly designated request workflow may dispatch that canonical owner, but
// it must never deploy the Worker itself. This preserves a single deployment path
// while allowing Mall source changes to request the canonical release explicitly.
const workflowDir = path.join(root, '.github', 'workflows');
const canonicalSharedSiteOwner = 'deploy-site-core.yml';
const authorizedSharedSiteDispatchers = new Set(['release-ekodi-mall.yml']);
const sharedSiteWritePatterns = [
  /guarded-worker-release\.mjs\s+--manifest\s+deploy\/manifests\/shared-site\.worker\.json/,
  /wrangler(?:@[^\s]+)?\s+deploy\s+--config\s+wrangler\.site\.toml/,
  /npm\s+run\s+deploy:site/,
];
const sharedSiteRedispatchPatterns = [
  /gh\s+workflow\s+run\s+deploy-site-core\.yml/,
  /workflow_dispatch[^\n]*deploy-site-core\.yml/,
];
for (const name of fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name))) {
  const file = `.github/workflows/${name}`;
  const text = read(file);
  const writesSharedSite = sharedSiteWritePatterns.some(pattern => pattern.test(text));
  const redispatchesSharedSite = sharedSiteRedispatchPatterns.some(pattern => pattern.test(text));
  if (name !== canonicalSharedSiteOwner && writesSharedSite) {
    fail(file, `shared-site production write is owned only by ${canonicalSharedSiteOwner}`);
  }
  if (name !== canonicalSharedSiteOwner && redispatchesSharedSite && !authorizedSharedSiteDispatchers.has(name)) {
    fail(file, 'shared-site deployment dispatch is restricted to the designated request workflow');
  }
}

const canonicalOwner = read(`.github/workflows/${canonicalSharedSiteOwner}`);
if (!/concurrency:\s*[\s\S]*group:\s*ekodi-shared-site-worker-production/.test(canonicalOwner)) {
  fail(`.github/workflows/${canonicalSharedSiteOwner}`, 'canonical shared-site owner must hold the production concurrency lock');
}

const mallDispatcher = requireText('.github/workflows/release-ekodi-mall.yml', [
  'gh workflow run deploy-site-core.yml',
  'Deployment requested. deploy-site-core.yml is the only production owner.',
]);
if (!/permissions:\s*[\s\S]*actions:\s*write/.test(mallDispatcher)) {
  fail('.github/workflows/release-ekodi-mall.yml', 'Mall deployment requester needs actions: write only to dispatch the canonical owner');
}
forbidText('.github/workflows/release-ekodi-mall.yml', [
  'guarded-worker-release.mjs',
  'npm run deploy:site',
  'npx wrangler',
  'wrangler@',
]);

// Legacy admin compatibility is intentionally manual-only and validation-only.
const legacyAdmin = requireText('.github/workflows/deploy-admin-site.yml', [
  'workflow_dispatch:',
  'Legacy Admin & Auth Compatibility Check',
  'ekodi-shared-site-worker-production',
]);
for (const trigger of [/\n\s*push\s*:/, /\n\s*pull_request\s*:/, /\n\s*schedule\s*:/]) {
  if (trigger.test(legacyAdmin)) fail('.github/workflows/deploy-admin-site.yml', 'legacy admin compatibility workflow must remain manual-only');
}
forbidText('.github/workflows/deploy-admin-site.yml', ['npm run deploy:site', 'guarded-worker-release.mjs', 'npx wrangler', 'wrangler@']);

forbidText('.github/workflows/deploy-site-core.yml', ['npm run deploy:site', 'wrangler.site.toml\n      - name: Deploy']);
forbidText('.github/workflows/deploy-books.yml', ['npm run deploy:books', 'deploy --config wrangler.books.toml']);
forbidText('.github/workflows/deploy-community.yml', ['npm run deploy:community', 'deploy --config wrangler.community.toml']);
forbidText('.github/workflows/deploy-social.yml', ['deploy --config wrangler.social.toml']);

// Stateful services are allowed isolated workers.dev staging; their production
// artifacts remain independently owned and must not write the shared-site runtime.
requireText('.github/workflows/deploy-control-api.yml', [
  'environment: development',
  'ekodi-auth-api-staging',
  'ekodi-auth-staging',
  'needs: [validate, staging]',
  'd1 time-travel info',
  'guarded-worker-release.mjs',
  'control-api.worker.json',
  'validate-additive-migrations.mjs',
]);
forbidText('.github/workflows/deploy-control-api.yml', ['npm run deploy:api', 'deploy --config wrangler.api.toml']);
requireText('.github/workflows/deploy-finance.yml', [
  'environment: development',
  'ekodi-finance-api-staging',
  'ekodi-auth-staging',
  'needs: [validate, staging]',
  'd1 time-travel info',
  'guarded-worker-release.mjs',
  'finance-api.worker.json',
  '--secrets-file /tmp/finance-secrets.json',
]);
forbidText('.github/workflows/deploy-finance.yml', ['npm run deploy:finance','deploy --config wrangler.finance.toml','secret put TOSS_SECRET_KEY','secret put TOSS_MID']);

requireText('.github/workflows/sync-marketing-ai.yml', ['guarded-pages-release.mjs', 'marketing-ai.pages.json']);
requireText('.github/workflows/deploy-jadam-marketing-ai.yml', ['guarded-pages-release.mjs', 'marketing-ai.pages.json']);
forbidText('.github/workflows/deploy-jadam-marketing-ai.yml', ['pages deploy', 'Configure EKODI DNS', 'Attach custom domains']);

const full = requireText('.github/workflows/deploy.yml', ['verification-only-no-production-write']);
for (const needle of ['wrangler@', 'npm run deploy:', 'd1 migrations apply', 'secret put']) if (full.includes(needle)) fail('.github/workflows/deploy.yml', `full-ecosystem workflow must remain verification-only: ${needle}`);

for (const file of ['.github/workflows/deploy-service-proxy.yml','.github/workflows/deploy-biz-legacy.yml','.github/workflows/deploy-legacy-redirects.yml']) {
  const text = requireText(file, ['topology-workflow-manual-only', 'workflow_dispatch:']);
  if (/\n\s*push\s*:/.test(text)) fail(file, 'domain-topology mutation workflow must not run automatically on push');
}

const accessFile = 'config/cloudflare-access-profiles.json';
const access = JSON.parse(read(accessFile));
if (access.status !== 'prepared-for-split-token') fail(accessFile, 'credential isolation status must remain honest until dedicated tokens are provisioned');
const profiles = new Map((access.profiles || []).map(profile => [profile.id, profile]));
for (const id of ['runtime-deploy','stateful-release','topology']) if (!profiles.has(id)) fail(accessFile, `missing access profile: ${id}`);
const topology = profiles.get('topology') || {};
if (topology.manualOnly !== true) fail(accessFile, 'topology credential must be manual-only');
if (!(topology.allow || []).includes('dns-write')) fail(accessFile, 'topology credential must explicitly own DNS mutation');
for (const id of ['runtime-deploy','stateful-release']) {
  const profile = profiles.get(id) || {};
  if (!(profile.deny || []).includes('dns-write')) fail(accessFile, `${id} must deny DNS mutation`);
}
const secrets = (access.profiles || []).map(profile => profile.secret).filter(Boolean);
if (new Set(secrets).size !== secrets.length) fail(accessFile, 'Cloudflare access profiles must use distinct GitHub secret names');
requireText('release-control-admin.js', ['automaticProductionBypass: false','topologyMutation: \'manual-only\'','prepared-for-split-token']);
forbidText('release-control-admin.js', ['credentialIsolation: \'enforced\'','CLOUDFLARE_API_TOKEN','CLOUDFLARE_TOPOLOGY_TOKEN']);

const packageJson = JSON.parse(read('package.json'));
for (const name of ['deploy:api', 'deploy:finance']) {
  const value = String(packageJson.scripts?.[name] || '');
  if (/wrangler.*\bdeploy\b/.test(value)) fail('package.json', `${name} still exposes a direct production Worker deploy command`);
}
for (const name of ['deploy:site', 'deploy:books', 'deploy:community']) {
  const value = String(packageJson.scripts?.[name] || '');
  if (!value.includes('guarded-worker-release.mjs')) fail('package.json', `${name} must use the guarded Worker release controller`);
}

if (failed) {
  console.error('Deployment policy audit failed. Production must have one writer per artifact and no unauthorized deployment dispatch loops.');
  process.exit(1);
}
console.log('✅ Deployment policy audit passed: shared-site has one production writer, one authorized Mall requester, and independent services remain behind their own guarded release boundaries.');
