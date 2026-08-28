import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.github/workflows');
const DEV_ACCOUNT = '46aad4738793fbaca88574832a2ccc0f';
const GUARD = 'uses: ./.github/actions/cloudflare-development-boundary';
const SHARED_D1_GROUP = 'ekodi-development-d1-ekodi-auth-staging';
const ACCESS_HELPER = 'access_aware_staging_start';

const customStageUrlMap = new Map([
  ['https://api-staging.ekodi.kr', 'https://ekodi-auth-api-staging.ekodi-development.workers.dev'],
  ['https://finance-api-staging.ekodi.kr', 'https://ekodi-finance-api-staging.ekodi-development.workers.dev'],
  ['https://marketing-api-staging.ekodi.kr', 'https://ekodi-marketing-domain-api-staging.ekodi-development.workers.dev'],
]);

function jobSlices(text) {
  const lines = text.split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) starts.push({ name: m[1], start: i });
  }
  return starts.map((item, index) => ({
    ...item,
    end: index + 1 < starts.length ? starts[index + 1].start : lines.length,
  }));
}

function isWorkerStaging(block) {
  return block.includes('environment: development')
    && /wrangler(?:@[^\s]+)?\s+deploy\b/.test(block)
    && !/wrangler(?:@[^\s]+)?\s+pages\s+deploy\b/.test(block);
}

function ensureGuard(block) {
  if (block.includes(GUARD)) return block;
  const lines = block.split('\n');
  let checkoutIndex = lines.findIndex((line) => line.includes('- uses: actions/checkout@v7'));
  if (checkoutIndex < 0) {
    const stepsIndex = lines.findIndex((line) => /^\s{4}steps:\s*$/.test(line));
    if (stepsIndex < 0) throw new Error('staging Worker job has neither checkout nor steps block');
    lines.splice(stepsIndex + 1, 0, '      - uses: actions/checkout@v7');
    checkoutIndex = stepsIndex + 1;
  }
  lines.splice(checkoutIndex + 1, 0,
    '      - name: Verify Development Cloudflare boundary',
    '        uses: ./.github/actions/cloudflare-development-boundary');
  return lines.join('\n');
}

function ensureSharedD1Concurrency(block) {
  if (!block.includes('ekodi-auth-staging')) return block;
  if (block.includes(`group: ${SHARED_D1_GROUP}`)) return block;
  const marker = '    environment: development\n';
  if (!block.includes(marker)) return block;
  return block.replace(marker,
    `${marker}    concurrency:\n      group: ${SHARED_D1_GROUP}\n      cancel-in-progress: false\n`);
}

function replaceCustomStageUrls(block) {
  let out = block;
  for (const [from, to] of customStageUrlMap) out = out.split(from).join(to);
  return out;
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

function ensureAccessAwareVerification(block) {
  if (block.includes(ACCESS_HELPER) || block.includes('Www-Authenticate: Cloudflare-Access')) return block;
  if (!block.includes('$STAGING_URL')) return block;
  const config = staticDeployConfig(block);
  if (!configSupportsStatelessLocalVerification(config)) return block;

  const lines = block.split('\n');
  let deployIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('deploy') && lines[i].includes(`--config ${config}`)) deployIndex = i;
  }
  if (deployIndex < 0) return block;

  let verifyStep = -1;
  for (let i = deployIndex + 1; i < lines.length; i += 1) {
    if (/^      - name:\s+.*verify.*staging/i.test(lines[i])) {
      verifyStep = i;
      break;
    }
  }
  if (verifyStep < 0) return block;

  let runIndex = -1;
  for (let i = verifyStep + 1; i < lines.length; i += 1) {
    if (/^      - name:/.test(lines[i])) break;
    if (/^        run:\s*\|\s*$/.test(lines[i])) {
      runIndex = i;
      break;
    }
  }
  if (runIndex < 0) return block;

  let insertIndex = runIndex + 1;
  for (let i = runIndex + 1; i < lines.length; i += 1) {
    if (/^      - name:/.test(lines[i])) break;
    if (/^          set -euo pipefail\s*$/.test(lines[i])) {
      insertIndex = i + 1;
      break;
    }
  }
  lines.splice(insertIndex, 0,
    '          source scripts/access-aware-staging.sh',
    `          access_aware_staging_start ${config} "$STAGING_URL" 8790`,
    '          STAGING_URL="$STAGING_VERIFY_URL"',
    '          trap access_aware_staging_stop EXIT');
  return lines.join('\n');
}

function hardenMarketingDomain(filename, blockName, block) {
  if (filename !== 'deploy-marketing-domain-api.yml') return block;
  let out = block;
  if (blockName === 'staging') {
    out = out.replace(/\n\s*test -n \"\$DOMAIN_CF_TOKEN\" \|\| \(echo 'Missing Marketing domain Cloudflare API token' && exit 1\)/, '');
    out = out.replace(/\n\s*printf '%s' \"\$DOMAIN_CF_TOKEN\" \| npx --yes wrangler@\$\{WRANGLER_VERSION\} secret put CF_API_TOKEN --config wrangler\.marketing-domains\.staging\.toml/, '');
    out = out.split('ALLOWED_ORIGINS = \"https://marketing.ekodi.kr,https://auth.ekodi.kr\"')
      .join('ALLOWED_ORIGINS = \"https://ekodi-marketing-staging.ekodi-development.workers.dev,https://ekodi-auth-api-staging.ekodi-development.workers.dev\"');
    out = out.split("Origin: https://demo.ai.ekodi.kr").join('Origin: https://ekodi-marketing-staging.ekodi-development.workers.dev');
    out = out.split("Origin: https://auth.ekodi.kr").join('Origin: https://ekodi-auth-api-staging.ekodi-development.workers.dev');
    out = out.split("Origin: https://marketing.ekodi.kr").join('Origin: https://ekodi-marketing-staging.ekodi-development.workers.dev');
  }
  if (blockName === 'production' && !out.includes('DOMAIN_CF_TOKEN: ${{ secrets.MARKETING_DOMAIN_CF_API_TOKEN }}')) {
    const marker = '      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n';
    if (!out.includes(marker)) throw new Error('production Marketing domain job lost Cloudflare account env marker');
    out = out.replace(marker, marker + '      DOMAIN_CF_TOKEN: ${{ secrets.MARKETING_DOMAIN_CF_API_TOKEN }}\n');
  }
  return out;
}

function isolatePullRequestConcurrency(filename, text) {
  if (filename === 'deploy-control-api.yml') {
    return text.replace(
      '  group: ekodi-control-api-release\n',
      "  group: ${{ github.event_name == 'pull_request' && format('ekodi-control-api-pr-{0}', github.event.pull_request.number) || 'ekodi-control-api-release' }}\n");
  }
  if (filename === 'release-messenger-investment-functional.yml') {
    return text.replace(
      '  group: ekodi-conversation-release\n',
      "  group: ${{ github.event_name == 'pull_request' && format('ekodi-conversation-pr-{0}', github.event.pull_request.number) || 'ekodi-conversation-release' }}\n");
  }
  if (filename === 'release-invest-personalization.yml') {
    return text.replace(
      '  group: ekodi-conversation-release\n',
      "  group: ${{ github.event_name == 'pull_request' && format('ekodi-invest-personalization-pr-{0}', github.event.pull_request.number) || 'ekodi-conversation-release' }}\n");
  }
  return text;
}

const files = fs.readdirSync(root).filter((name) => name.endsWith('.yml')).sort();
let changed = 0;
for (const filename of files) {
  const full = path.join(root, filename);
  let text = fs.readFileSync(full, 'utf8');
  const original = text;

  text = isolatePullRequestConcurrency(filename, text);
  if (filename === 'deploy-marketing-domain-api.yml') {
    text = text.replace(/^\s*DOMAIN_CF_TOKEN:\s*\$\{\{\s*secrets\.MARKETING_DOMAIN_CF_API_TOKEN\s*\|\|\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}\s*\n/m, '');
  }

  const lines = text.split('\n');
  const slices = jobSlices(text);
  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const { name, start, end } = slices[i];
    let block = lines.slice(start, end).join('\n');
    if (!isWorkerStaging(block)) {
      block = hardenMarketingDomain(filename, name, block);
    } else {
      block = replaceCustomStageUrls(block);
      block = ensureSharedD1Concurrency(block);
      block = ensureGuard(block);
      block = hardenMarketingDomain(filename, name, block);
      block = ensureAccessAwareVerification(block);
    }
    lines.splice(start, end - start, ...block.split('\n'));
  }
  text = lines.join('\n');

  if (text.includes('CLOUDFLARE_ACCOUNT_ID: 46aad4738793fbaca88574832a2ccc0f')) {
    // Keep explicit immutable Development account binding; the runtime guard verifies it against Cloudflare.
  }
  if (text !== original) {
    fs.writeFileSync(full, text);
    changed += 1;
    console.log(`hardened ${filename}`);
  }
}
console.log(`Cloudflare staging hardening complete: ${changed} workflow file(s) changed; Development account ${DEV_ACCOUNT}.`);
