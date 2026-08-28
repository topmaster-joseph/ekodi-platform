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

// Legacy admin compatibility is intentionally manual-only. It must never become an
// automatic production deploy again, but because it performs no production write it
// must not be forced to contain the guarded release controller or Worker manifest.
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

requireText('.github/workflows/deploy-control-api.yml', [
  'environment: development',
  'STAGING_BASE_URL',
  'workers\\.dev',
  'ekodi-auth-staging',
  'environment: production',
  "github.event_name == 'push' && github.ref == 'refs/heads/main'",
  'd1 time-travel info',
  'guarded-worker-release.mjs',
  'control-api.worker.json',
  'validate-additive-migrations.mjs',
]);
forbidText('.github/workflows/deploy-control-api.yml', ['api-staging.ekodi.kr', 'npm run deploy:api', 'deploy --config wrangler.api.toml']);
requireText('.github/workflows/deploy-finance.yml', [
  'environment: development',
  'STAGING_BASE_URL',
  'workers\\.dev',
  'environment: production',
  "github.event_name == 'push' && github.ref == 'refs/heads/main'",
  'd1 time-travel info',
  'guarded-worker-release.mjs',
  'finance-api.worker.json',
  '--secrets-file /tmp/finance-secrets.json',
]);
forbidText('.github/workflows/deploy-finance.yml', ['finance-api-staging.ekodi.kr','npm run deploy:finance','deploy --config wrangler.finance.toml','secret put TOSS_SECRET_KEY','secret put TOSS_MID']);

requireText('.github/workflows/release-messenger-investment-functional.yml', [
  'API_STAGING_URL: https://ekodi-workspace-platform-api-staging.ekodi-development.workers.dev',
  'SITE_STAGING_URL: https://ekodi-shared-site-staging.ekodi-development.workers.dev',
  'CONTROL_STAGING_URL: https://ekodi-conversation-control-staging.ekodi-development.workers.dev',
  'workspace-staging:\n    environment: development',
  'control-staging:\n    environment: development',
  'staging-ui:\n    environment: development',
  'production-workspace:\n    environment: production',
  'production-control:\n    environment: production',
  'production-ui:\n    environment: production',
  "github.event_name == 'push' && github.ref == 'refs/heads/main'",
]);
forbidText('.github/workflows/release-messenger-investment-functional.yml', ['.topmaster-joseph.workers.dev']);

requireText('.github/workflows/sync-marketing-ai.yml', ['guarded-pages-release.mjs', 'marketing-ai.pages.json']);
requireText('.github/workflows/deploy-jadam-marketing-ai.yml', ['guarded-pages-release.mjs', 'marketing-ai.pages.json']);
forbidText('.github/workflows/deploy-jadam-marketing-ai.yml', ['pages deploy', 'Configure EKODI DNS', 'Attach custom domains']);

const full = requireText('.github/workflows/deploy.yml', ['verification-only-no-production-write']);
for (const needle of ['wrangler@', 'npm run deploy:', 'd1 migrations apply', 'secret put']) if (full.includes(needle)) fail('.github/workflows/deploy.yml', `full-ecosystem workflow must remain verification-only: ${needle}`);

for (const file of ['.github/workflows/deploy-service-proxy.yml','.github/workflows/deploy-biz-legacy.yml','.github/workflows/deploy-legacy-redirects.yml']) {
  const text = requireText(file, ['topology-workflow-manual-only', 'workflow_dispatch:']);
  if (/\n\s*push\s*:/.test(text)) fail(file, 'domain-topology mutation workflow must not run automatically on push');
}

const developmentWorkflow = requireText('.github/workflows/deploy-development.yml', [
  'branches: [development]',
  'environment: development',
  'refs/heads/development',
  'CLOUDFLARE_DEVELOPMENT_API_TOKEN',
  'wrangler.development.jsonc',
]);
for (const unsafe of ['secrets.CLOUDFLARE_API_TOKEN', 'secrets.CLOUDFLARE_ACCOUNT_ID', 'wrangler.site.toml', 'wrangler.api.toml', 'wrangler.finance.toml']) {
  if (developmentWorkflow.includes(unsafe)) fail('.github/workflows/deploy-development.yml', `development deployment must not reference production credential/config marker: ${unsafe}`);
}

const supabaseLocal = requireText('.github/workflows/supabase-local-ci.yml', [
  'Supabase Local CI',
  '127.0.0.1:54322',
  'supabase@$SUPABASE_CLI_VERSION db start',
  'supabase@$SUPABASE_CLI_VERSION stop --no-backup',
]);
for (const unsafe of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'supabase link', 'db push', 'functions deploy']) {
  if (supabaseLocal.includes(unsafe)) fail('.github/workflows/supabase-local-ci.yml', `local Supabase CI must not reach production: ${unsafe}`);
}

requireText('scripts/validate-ai-provider-independence.mjs', [
  'guardedProductionInvocation',
  "process.env.GITHUB_ACTIONS === 'true'",
  "ref !== 'refs/heads/main'",
  "event === 'pull_request_target'",
  'Production release context blocked',
]);
requireText('scripts/apply-d1-migrations-with-retry.sh', [
  'is_nonproduction_target',
  'refs/heads/main',
  'Production D1 migration blocked',
]);
requireText('.github/workflows/ci.yml', ['deploy-development.yml', 'supabase-local-ci.yml']);

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
  console.error('Deployment policy audit failed. Production must stay behind development/local validation and guarded main-branch promotion gates.');
  process.exit(1);
}
console.log('✅ Deployment policy audit passed: development, local Supabase validation and production writes remain separated, staging avoids production DNS, and guarded production promotion is restricted to main.');
