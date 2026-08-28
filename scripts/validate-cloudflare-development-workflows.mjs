import fs from 'node:fs';
import path from 'node:path';

const workflowRoot = path.resolve('.github/workflows');
const guardMarker = 'uses: ./.github/actions/cloudflare-development-boundary';
const accessHelperMarker = 'access_aware_staging_start';
const devSecret = 'secrets.CLOUDFLARE_DEVELOPMENT_API_TOKEN';
const devAccount = '46aad4738793fbaca88574832a2ccc0f';
const prodSecretMarkers = ['secrets.CLOUDFLARE_API_TOKEN', 'secrets.CLOUDFLARE_ACCOUNT_ID'];
const productionNamespace = 'topmaster-joseph.workers.dev';
const errors = [];

function splitJobs(text) {
  const lines = text.split('\n');
  const jobsLine = lines.findIndex((line) => line === 'jobs:');
  if (jobsLine < 0) return { global: text, jobs: [] };
  const global = lines.slice(0, jobsLine).join('\n');
  const starts = [];
  for (let i = jobsLine + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (match) starts.push({ name: match[1], start: i });
  }
  const jobs = starts.map((item, index) => ({
    name: item.name,
    block: lines.slice(item.start, index + 1 < starts.length ? starts[index + 1].start : lines.length).join('\n'),
  }));
  return { global, jobs };
}

function isWorkerStaging(block) {
  return block.includes('environment: development')
    && /wrangler(?:@[^\s]+)?\s+deploy\b/.test(block)
    && !/wrangler(?:@[^\s]+)?\s+pages\s+deploy\b/.test(block);
}

function staticDeployConfig(block) {
  const matches = [...block.matchAll(/wrangler(?:@[^\s]+)?\s+deploy\s+--config\s+([A-Za-z0-9._/-]+)/g)];
  return matches.length ? matches[matches.length - 1][1] : '';
}

function configSupportsStatelessLocalVerification(config) {
  if (!config || !fs.existsSync(config)) return false;
  const text = fs.readFileSync(config, 'utf8');
  return !/^\s*\[\[(d1_databases|kv_namespaces|r2_buckets|queues\.|services)\]\]/mi.test(text)
    && !/^\s*\[durable_objects\]/mi.test(text);
}

function hasPostDeployStagingVerification(block, config) {
  if (!config) return false;
  const lines = block.split('\n');
  let deployIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('deploy') && lines[i].includes(`--config ${config}`)) deployIndex = i;
  }
  if (deployIndex < 0) return false;
  return lines.slice(deployIndex + 1).some((line) => /^      - name:\s+.*verify.*staging/i.test(line));
}

for (const filename of fs.readdirSync(workflowRoot).filter((name) => name.endsWith('.yml')).sort()) {
  if (filename === 'cloudflare-development-runtime-audit.yml') continue;
  const text = fs.readFileSync(path.join(workflowRoot, filename), 'utf8');
  const { global, jobs } = splitJobs(text);
  const stagingJobs = jobs.filter(({ block }) => isWorkerStaging(block));
  if (!stagingJobs.length) continue;

  for (const marker of prodSecretMarkers) {
    if (global.includes(marker)) errors.push(`${filename}: top-level env leaks Production Cloudflare credential into staging jobs: ${marker}`);
  }
  if (/MARKETING_DOMAIN_CF_API_TOKEN\s*\|\|\s*secrets\.CLOUDFLARE_API_TOKEN/.test(global)) {
    errors.push(`${filename}: provider credential falls back to generic Production Cloudflare token at workflow scope`);
  }
  if (filename === 'deploy-control-api.yml' && /^\s*group:\s*ekodi-control-api-release\s*$/m.test(global)) {
    errors.push(`${filename}: pull-request validation still competes with the Production control release concurrency lane`);
  }
  if ((filename === 'release-messenger-investment-functional.yml' || filename === 'release-invest-personalization.yml')
      && /^\s*group:\s*ekodi-conversation-release\s*$/m.test(global)) {
    errors.push(`${filename}: pull-request validation still competes with the Production conversation release concurrency lane`);
  }

  for (const { name, block } of stagingJobs) {
    const label = `${filename}:${name}`;
    if (!block.includes(devSecret)) errors.push(`${label}: missing Development API token`);
    if (!block.includes(devAccount)) errors.push(`${label}: missing immutable Development account binding`);
    if (!block.includes(guardMarker)) errors.push(`${label}: missing reusable runtime Development boundary guard`);
    if (prodSecretMarkers.some((marker) => block.includes(marker))) errors.push(`${label}: references Production Cloudflare credential`);
    if (block.includes(productionNamespace)) errors.push(`${label}: references Production workers.dev namespace`);

    const customStageHosts = [...block.matchAll(/https:\/\/[A-Za-z0-9.-]*-staging\.ekodi\.kr\b/g)].map((m) => m[0]);
    for (const host of new Set(customStageHosts)) errors.push(`${label}: custom staging hostname is forbidden; use Development workers.dev namespace instead: ${host}`);

    if (block.includes('ekodi-auth-staging') && /d1\s+(migrations\s+apply|execute|create)/.test(block)) {
      if (!block.includes('group: ekodi-development-d1-ekodi-auth-staging')) {
        errors.push(`${label}: shared ekodi-auth-staging mutation is missing cross-workflow concurrency group`);
      }
    }

    const config = staticDeployConfig(block);
    if (block.includes('$STAGING_URL')
        && configSupportsStatelessLocalVerification(config)
        && hasPostDeployStagingVerification(block, config)
        && !block.includes(accessHelperMarker)
        && !block.includes('Www-Authenticate: Cloudflare-Access')) {
      errors.push(`${label}: stateless staging verification is not resilient to Cloudflare Access protection`);
    }
  }
}

const stagingConfigPatterns = [/^wrangler.*staging.*\.toml$/i, /^wrangler.*staging.*\.jsonc$/i];
for (const filename of fs.readdirSync('.').filter((name) => stagingConfigPatterns.some((re) => re.test(name))).sort()) {
  const text = fs.readFileSync(filename, 'utf8');
  if (filename === 'wrangler.marketing-publishing.staging.toml' && /database_id\s*=/.test(text)) {
    errors.push(`${filename}: read-only staging must not carry a fixed D1 database_id`);
  }
  if (text.includes('topmaster-joseph.workers.dev')) errors.push(`${filename}: references Production workers.dev namespace`);
}

const accessHelper = fs.readFileSync('scripts/access-aware-staging.sh', 'utf8');
for (const marker of ['Cloudflare-Access', 'deployments status', 'wrangler@${wrangler_version}']} ) {
  if (!accessHelper.includes(marker)) errors.push(`scripts/access-aware-staging.sh: missing safety marker ${marker}`);
}
if (accessHelper.includes('CLOUDFLARE_API_TOKEN=')) errors.push('scripts/access-aware-staging.sh: must not manufacture or override Cloudflare credentials');

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
console.log('Cloudflare Development runtime audit passed: staging Workers are isolated, guarded, Access-aware, concurrency-safe and free of Production credential inheritance.');
