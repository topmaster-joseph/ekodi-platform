import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const readArg = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};

const root = path.resolve(readArg('--root', '.'));
const policyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestArg = readArg('--manifest');
const manifestPath = manifestArg ? path.resolve(manifestArg) : '';
const wranglerVersion = readArg('--wrangler-version', '4.119.0');
const secretsFileArg = readArg('--secrets-file');
const secretsFilePath = secretsFileArg ? path.resolve(secretsFileArg) : '';

if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error('Usage: node scripts/guarded-worker-release.mjs --manifest <file> [--root <dir>] [--secrets-file <file>]');
  process.exit(2);
}
if (secretsFilePath && !fs.existsSync(secretsFilePath)) {
  console.error('Secrets file was requested but does not exist.');
  process.exit(2);
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID');
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const worker = manifest.worker || {};
if (!worker.name || !worker.config || !Array.isArray(worker.requests) || !worker.requests.length) {
  throw new Error('Worker manifest requires worker.name, worker.config and worker.requests.');
}

const configPath = path.resolve(root, worker.config);
if (!configPath.startsWith(root + path.sep) || !fs.existsSync(configPath)) {
  throw new Error(`Worker config not found inside release root: ${worker.config}`);
}

const runId = String(process.env.GITHUB_RUN_ID || Date.now());
const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1');
const tag = `ekodi-${runId}-${attempt}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 48);
let previousVersion = '';
let candidateVersion = '';
let candidateAttached = false;

function runProviderIndependenceGate() {
  const env = { ...process.env, AI_PROVIDER: 'NONE' };
  for (const argv of [
    ['scripts/validate-ai-provider-independence.mjs'],
    ['--test', 'test/ai-provider-none.test.mjs'],
  ]) {
    const result = spawnSync(process.execPath, argv, {
      cwd: policyRoot,
      env,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error(`AI_PROVIDER=NONE release gate failed: node ${argv.join(' ')}`);
  }
  console.log('✅ AI_PROVIDER=NONE release gate passed.');
}

function command(argv, { json = false } = {}) {
  const result = spawnSync('npx', ['--yes', `wrangler@${wranglerVersion}`, ...argv], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (!json) process.stdout.write(`${stdout}${stderr}`);
  if (result.status !== 0) {
    if (json) process.stdout.write(`${stdout}${stderr}`);
    throw new Error(`wrangler ${argv.join(' ')} failed with exit code ${result.status}`);
  }
  return json ? stdout.trim() : `${stdout}${stderr}`;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    const startArray = text.indexOf('[');
    const startObject = text.indexOf('{');
    const start = [startArray, startObject].filter(v => v >= 0).sort((a, b) => a - b)[0];
    if (start !== undefined) {
      try { return JSON.parse(text.slice(start)); } catch {}
    }
    throw new Error(`Could not parse ${label} JSON.`);
  }
}

function uuidFrom(value) {
  const match = String(value || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] || '';
}

function activeVersions(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) activeVersions(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const entries = Object.entries(value);
  const percentageEntry = entries.find(([key]) => /percentage|traffic/i.test(key));
  const idEntry = entries.find(([key, item]) => /version.*id|^id$/i.test(key) && uuidFrom(item));
  if (percentageEntry && idEntry) {
    const percentage = Number(percentageEntry[1]);
    if (Number.isFinite(percentage)) out.push({ id: uuidFrom(idEntry[1]), percentage });
  }
  for (const [, item] of entries) activeVersions(item, out);
  return out;
}

function findTaggedVersion(value, expectedTag) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaggedVersion(item, expectedTag);
      if (found) return found;
    }
    return '';
  }
  if (!value || typeof value !== 'object') return '';
  const tagValue = Object.entries(value).find(([key]) => /^tag$/i.test(key))?.[1];
  if (tagValue === expectedTag) {
    for (const [key, item] of Object.entries(value)) {
      if (/version.*id|^id$/i.test(key)) {
        const id = uuidFrom(item);
        if (id) return id;
      }
    }
  }
  for (const item of Object.values(value)) {
    const found = findTaggedVersion(item, expectedTag);
    if (found) return found;
  }
  return '';
}

function currentSingleVersion() {
  const raw = command(['deployments', 'status', '--config', worker.config, '--json'], { json: true });
  const status = parseJson(raw, 'deployment status');
  const weighted = activeVersions(status).filter(item => item.id && item.percentage > 0);
  const unique = [...new Map(weighted.map(item => [item.id, item])).values()];
  if (unique.length !== 1 || unique[0].percentage < 99.9) {
    throw new Error(`Refusing guarded release because ${worker.name} is not on one stable 100% version.`);
  }
  return unique[0].id;
}

function uploadCandidate() {
  const uploadArgs = [
    'versions', 'upload', '--config', worker.config,
    '--tag', tag,
    '--message', `EKODI guarded candidate ${tag}`,
  ];
  if (secretsFilePath) uploadArgs.push('--secrets-file', secretsFilePath);
  const output = command(uploadArgs);
  const direct = output.match(/Worker Version ID:\s*([0-9a-f-]{36})/i)?.[1] || '';
  if (direct) return direct;

  const raw = command(['versions', 'list', '--config', worker.config, '--json'], { json: true });
  const versions = parseJson(raw, 'versions list');
  const found = findTaggedVersion(versions, tag);
  if (!found) throw new Error(`Could not resolve uploaded candidate version from Wrangler output or tag ${tag}.`);
  return found;
}

function deployVersions(specs, message) {
  command(['versions', 'deploy', ...specs, '-y', '--config', worker.config, '--message', message]);
}

async function fetchCheck(request, overrideVersion = '') {
  const statuses = Array.isArray(request.statuses) && request.statuses.length ? request.statuses : [200];
  const headers = { 'user-agent': 'EKODI-Worker-Release-Gate/1.0' };
  if (overrideVersion) {
    headers['Cloudflare-Workers-Version-Overrides'] = `${worker.name}="${overrideVersion}"`;
  }
  let last = '';
  for (let attemptIndex = 1; attemptIndex <= 18; attemptIndex += 1) {
    try {
      const response = await fetch(request.url, {
        redirect: request.redirect || 'manual',
        headers,
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.text();
      last = `${response.status} ${response.statusText}`;
      if (!statuses.includes(response.status)) throw new Error(`unexpected HTTP ${response.status}`);
      for (const marker of request.expect || []) {
        if (!body.includes(marker)) throw new Error(`missing body marker: ${marker}`);
      }
      for (const marker of request.forbid || []) {
        if (body.includes(marker)) throw new Error(`forbidden body marker: ${marker}`);
      }
      for (const marker of request.headerExpect || []) {
        const normalized = [...response.headers.entries()].map(([key, value]) => `${key}: ${value}`).join('\n').toLowerCase();
        if (!normalized.includes(String(marker).toLowerCase())) throw new Error(`missing header marker: ${marker}`);
      }
      console.log(`✅ ${overrideVersion ? 'candidate' : 'production'} verified: ${request.url}`);
      return;
    } catch (error) {
      last = error?.message || String(error);
      if (attemptIndex < 18) await new Promise(resolve => setTimeout(resolve, 3500));
    }
  }
  throw new Error(`${request.url} verification failed: ${last}`);
}

async function verifyAll(overrideVersion = '') {
  for (const request of worker.requests) await fetchCheck(request, overrideVersion);
}

function appendSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

try {
  console.log(`Worker guarded release: ${worker.name}`);
  runProviderIndependenceGate();
  if (secretsFilePath) console.log('Candidate will include the supplied secret set without printing secret values.');
  previousVersion = currentSingleVersion();
  console.log(`Stable production version: ${previousVersion}`);

  candidateVersion = uploadCandidate();
  console.log(`Candidate version: ${candidateVersion}`);

  console.log('Phase 1/3: attach candidate at 0% traffic while stable version remains at 100%.');
  deployVersions([
    `${previousVersion}@100%`,
    `${candidateVersion}@0%`,
  ], `EKODI candidate smoke gate ${tag}`);
  candidateAttached = true;

  console.log('Phase 2/3: smoke-test the 0% candidate through Cloudflare version overrides.');
  await verifyAll(candidateVersion);

  console.log('Phase 3/3: candidate passed, promote it to 100% and verify production without overrides.');
  deployVersions([`${candidateVersion}@100%`], `EKODI guarded promote ${tag}`);
  await verifyAll('');

  appendSummary([
    `## EKODI guarded Worker release: ${worker.name}`,
    '',
    `- Previous stable: \`${previousVersion}\``,
    `- Candidate: \`${candidateVersion}\``,
    `- Candidate secret file: ${secretsFilePath ? 'supplied securely' : 'not supplied; existing Worker secrets preserved by Wrangler'}`,
    '- AI_PROVIDER=NONE resilience gate passed before any production candidate was attached.',
    '- Candidate was attached at 0% traffic, verified with version overrides, then promoted to 100%.',
    '- Production smoke verification passed after promotion.',
  ]);
  console.log('✅ Guarded Worker release complete.');
} catch (error) {
  console.error(`❌ Guarded Worker release failed: ${error?.message || error}`);
  if (candidateAttached && previousVersion) {
    try {
      console.error(`Rolling back ${worker.name} to ${previousVersion} at 100%.`);
      deployVersions([`${previousVersion}@100%`], `EKODI automatic rollback after failed gate ${tag}`);
      await verifyAll('');
      console.error('✅ Automatic rollback verified.');
    } catch (rollbackError) {
      console.error(`❌ Automatic rollback verification failed: ${rollbackError?.message || rollbackError}`);
    }
  }
  process.exit(1);
}
