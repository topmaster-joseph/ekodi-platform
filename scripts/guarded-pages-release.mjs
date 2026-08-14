import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const readArg = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};

const root = path.resolve(readArg('--root', '.'));
const manifestPath = path.resolve(readArg('--manifest'));
const wranglerVersion = readArg('--wrangler-version', '4.119.0');

if (!readArg('--manifest')) {
  console.error('Usage: node scripts/guarded-pages-release.mjs --manifest <file> [--root <dir>]');
  process.exit(2);
}
if (!fs.existsSync(manifestPath)) {
  console.error(`Release manifest not found: ${manifestPath}`);
  process.exit(2);
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID');
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const targets = Array.isArray(manifest.targets) ? manifest.targets : [];
if (!targets.length) {
  console.error('Release manifest must contain at least one target.');
  process.exit(2);
}

const runId = String(process.env.GITHUB_RUN_ID || Date.now());
const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1');
const previewBranch = `staging-${runId}-${attempt}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48);
const previewResults = [];

function command(bin, argv, options = {}) {
  const result = spawnSync(bin, argv, {
    cwd: options.cwd || root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.status !== 0) {
    throw new Error(`${bin} ${argv.join(' ')} failed with exit code ${result.status}`);
  }
  return output;
}

function resolveDirectory(target) {
  const directory = path.resolve(root, target.directory || '');
  if (!directory.startsWith(root + path.sep) && directory !== root) {
    throw new Error(`Target directory escapes release root: ${target.directory}`);
  }
  if (!fs.existsSync(directory)) {
    throw new Error(`Target directory not found: ${directory}`);
  }
  return directory;
}

function extractPagesUrl(output) {
  const urls = output.match(/https:\/\/[a-zA-Z0-9.-]+\.pages\.dev\/?/g) || [];
  return urls.at(-1) || '';
}

async function fetchText(url, label, attempts = 18) {
  let last = '';
  for (let index = 1; index <= attempts; index += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'EKODI-Release-Gate/1.0' },
        signal: AbortSignal.timeout(12000),
      });
      last = `${response.status} ${response.statusText}`;
      if (response.ok) return await response.text();
    } catch (error) {
      last = error?.message || String(error);
    }
    if (index < attempts) await new Promise(resolve => setTimeout(resolve, 4000));
  }
  throw new Error(`${label} did not become healthy: ${last}`);
}

async function verify(url, target, phase) {
  const text = await fetchText(url, `${target.name || target.project} ${phase}`);
  const expected = Array.isArray(target.expect) ? target.expect : [];
  for (const marker of expected) {
    if (!text.includes(marker)) {
      throw new Error(`${target.name || target.project} ${phase} is missing marker: ${marker}`);
    }
  }
  const forbidden = Array.isArray(target.forbid) ? target.forbid : [];
  for (const marker of forbidden) {
    if (text.includes(marker)) {
      throw new Error(`${target.name || target.project} ${phase} contains forbidden marker: ${marker}`);
    }
  }
  console.log(`✅ ${target.name || target.project} ${phase} verified: ${url}`);
}

function deploy(target, branch) {
  const directory = resolveDirectory(target);
  const output = command('npx', [
    '--yes',
    `wrangler@${wranglerVersion}`,
    'pages',
    'deploy',
    directory,
    `--project-name=${target.project}`,
    `--branch=${branch}`,
  ]);
  return extractPagesUrl(output);
}

function appendSummary(lines) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  fs.appendFileSync(summary, `${lines.join('\n')}\n`);
}

console.log(`Release gate preview branch: ${previewBranch}`);
console.log('Phase 1/3: deploy every target to isolated Cloudflare Pages previews.');
for (const target of targets) {
  if (!target.project || !target.directory || !target.productionUrl) {
    throw new Error('Each target requires project, directory and productionUrl.');
  }
  const previewUrl = deploy(target, previewBranch);
  if (!previewUrl) throw new Error(`Could not determine preview URL for ${target.project}`);
  previewResults.push({ target, previewUrl });
}

console.log('Phase 2/3: verify every preview before production can change.');
for (const item of previewResults) {
  await verify(item.previewUrl, item.target, 'preview');
}

console.log('Phase 3/3: all previews passed, promoting the same build output to production.');
for (const target of targets) {
  deploy(target, 'main');
}

for (const target of targets) {
  await verify(target.productionUrl, target, 'production');
}

appendSummary([
  '## EKODI guarded Pages release',
  '',
  `Preview gate: \`${previewBranch}\``,
  '',
  '| Target | Preview | Production |',
  '|---|---|---|',
  ...previewResults.map(({ target, previewUrl }) => `| ${target.name || target.project} | ${previewUrl} | ${target.productionUrl} |`),
  '',
  '✅ All preview checks passed before production promotion, and all production smoke checks passed after promotion.',
]);

console.log('✅ Guarded release complete: preview gate passed, production promoted, production verified.');
