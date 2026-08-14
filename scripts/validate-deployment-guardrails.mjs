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
  '.github/workflows/deploy-admin-site.yml': ['guarded-worker-release.mjs', 'shared-site.worker.json'],
  '.github/workflows/deploy-books.yml': ['guarded-worker-release.mjs', 'books.worker.json'],
  '.github/workflows/deploy-community.yml': ['guarded-worker-release.mjs', 'community.worker.json'],
  '.github/workflows/deploy-social.yml': ['guarded-worker-release.mjs', 'social.worker.json'],
};
for (const [file, needles] of Object.entries(workerGuarded)) requireText(file, needles);
forbidText('.github/workflows/deploy-site-core.yml', ['npm run deploy:site', 'wrangler.site.toml\n      - name: Deploy']);
forbidText('.github/workflows/deploy-admin-site.yml', ['npm run deploy:site']);
forbidText('.github/workflows/deploy-books.yml', ['npm run deploy:books', 'deploy --config wrangler.books.toml']);
forbidText('.github/workflows/deploy-community.yml', ['npm run deploy:community', 'deploy --config wrangler.community.toml']);
forbidText('.github/workflows/deploy-social.yml', ['deploy --config wrangler.social.toml']);

requireText('.github/workflows/deploy-control-api.yml', ['api-staging.ekodi.kr','ekodi-auth-staging','d1 time-travel info','guarded-worker-release.mjs','control-api.worker.json','validate-additive-migrations.mjs']);
forbidText('.github/workflows/deploy-control-api.yml', ['npm run deploy:api', 'deploy --config wrangler.api.toml']);
requireText('.github/workflows/deploy-finance.yml', ['finance-api-staging.ekodi.kr','d1 time-travel info','guarded-worker-release.mjs','finance-api.worker.json','--secrets-file /tmp/finance-secrets.json']);
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
  console.error('Deployment policy audit failed. Production must stay behind staging/candidate gates.');
  process.exit(1);
}
console.log('✅ Deployment policy audit passed: protected production paths cannot bypass guarded release gates.');
