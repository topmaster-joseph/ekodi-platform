import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config', 'ai-change-orchestration-policy.json');
const releaseMode = process.argv.includes('--release');
const ciMode = process.argv.includes('--ci') || releaseMode;

function fail(message) {
  console.error(`[EKODI][AI-ORCHESTRATE-001] ${message}`);
  process.exit(1);
}
function text(value) { return String(value ?? '').trim(); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? text(result.stdout) : '';
}
function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (!fs.existsSync(policyPath)) fail('orchestration policy is missing.');
const policy = readJson(policyPath);
if (policy.policyId !== 'AI-ORCHESTRATE-001' || policy.status !== 'enforced') fail('policy must remain enforced.');
if (policy.controlPlane !== 'EKODI AI') fail('EKODI AI must remain the control plane.');
if (policy.mutationBoundary?.breakGlassBypassEnabled !== false) fail('break-glass bypass must remain disabled.');
if (policy.sourceControl?.directPushToMain !== false) fail('direct main pushes must remain forbidden.');
if (policy.execution?.externalAiMayOwnProductionMutation !== false) fail('external AI cannot own production mutation.');

const eventName = text(process.env.GITHUB_EVENT_NAME);
const eventPath = text(process.env.GITHUB_EVENT_PATH);
const event = eventPath && fs.existsSync(eventPath) ? readJson(eventPath) : {};
const repository = text(process.env.GITHUB_REPOSITORY || 'local/ekodi-platform');
const runId = text(process.env.GITHUB_RUN_ID || 'local');
const sha = text(process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']) || 'unknown');
const actor = text(process.env.GITHUB_ACTOR || event.sender?.login || 'local');
const defaultBranch = policy.sourceControl.defaultBranch || 'main';
const allowedPrefixes = policy.sourceControl.allowedChangeBranchPrefixes || ['ai/'];

function branchAllowed(branch) {
  return allowedPrefixes.some(prefix => text(branch).startsWith(prefix));
}
function currentChangedFiles() {
  const base = event.pull_request?.base?.sha;
  if (base) {
    const out = git(['diff', '--name-only', `${base}...${sha}`]);
    if (out) return out.split(/\r?\n/).filter(Boolean);
  }
  const out = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}
function parseProvenancePayload(raw, sourceLabel) {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) fail(`PR merge provenance from ${sourceLabel} must be a JSON array.`);
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) fail(`PR merge provenance from ${sourceLabel} is malformed JSON.`);
    throw error;
  }
}
function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'ekodi-ai-orchestration-gate',
  };
  const token = text(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
async function fetchGithubJson(endpoint, sourceLabel, { allowNotFound = false } = {}) {
  let response;
  try {
    response = await fetch(endpoint, { headers: githubHeaders(), signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Error(`unable to verify PR merge provenance from ${sourceLabel}: ${error?.message || 'network error'}`);
  }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new Error(`unable to verify PR merge provenance from ${sourceLabel}: HTTP ${response.status}`);
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new Error(`PR merge provenance from ${sourceLabel} is malformed JSON.`);
  }
}
function candidatePullRequestNumbers() {
  const firstLine = text(event.head_commit?.message || git(['log', '-1', '--pretty=%B', sha])).split(/\r?\n/, 1)[0];
  const numbers = new Set();
  for (const pattern of [/^Merge (?:pull request|PR) #(\d+)\b/i, /\(#(\d+)\)\s*$/]) {
    const match = firstLine.match(pattern);
    if (match?.[1]) numbers.add(match[1]);
  }
  return [...numbers];
}
function isVerifiedMergedPr(pr) {
  return Boolean(pr)
    && text(pr?.state) === 'closed'
    && Boolean(pr?.merged_at)
    && text(pr?.base?.ref) === defaultBranch
    && text(pr?.merge_commit_sha) === sha
    && branchAllowed(pr?.head?.ref);
}
async function loadAssociatedPullRequests() {
  const provenancePath = text(process.env.EKODI_GITHUB_PR_PROVENANCE);
  if (provenancePath) {
    if (!fs.existsSync(provenancePath)) fail(`PR merge provenance file is missing: ${provenancePath}`);
    return parseProvenancePayload(fs.readFileSync(provenancePath, 'utf8'), provenancePath);
  }

  if (!repository.includes('/') || sha === 'unknown') fail('GitHub repository/SHA is unavailable for PR merge provenance verification.');
  const apiBase = text(process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const endpoint = `${apiBase}/repos/${repository}/commits/${encodeURIComponent(sha)}/pulls`;
  const value = await fetchGithubJson(endpoint, 'GitHub commit association API');
  if (!Array.isArray(value)) throw new Error('PR merge provenance from GitHub commit association API must be a JSON array.');
  return value;
}
async function loadPullRequestByNumber(number) {
  const lookupPath = text(process.env.EKODI_GITHUB_PR_LOOKUP);
  if (lookupPath) {
    if (!fs.existsSync(lookupPath)) fail(`PR lookup fixture is missing: ${lookupPath}`);
    let lookup;
    try {
      lookup = JSON.parse(fs.readFileSync(lookupPath, 'utf8'));
    } catch {
      fail(`PR lookup fixture is malformed JSON: ${lookupPath}`);
    }
    return lookup?.[String(number)] || null;
  }

  if (!repository.includes('/')) return null;
  const apiBase = text(process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  return fetchGithubJson(`${apiBase}/repos/${repository}/pulls/${encodeURIComponent(number)}`, `GitHub PR #${number}`, { allowNotFound: true });
}
async function verifiedMainPrMerge() {
  const fixtureMode = Boolean(text(process.env.EKODI_GITHUB_PR_PROVENANCE) || text(process.env.EKODI_GITHUB_PR_LOOKUP));
  const attempts = fixtureMode ? 1 : boundedInteger(process.env.EKODI_GITHUB_PROVENANCE_ATTEMPTS, 10, 1, 12);
  const retryBaseMs = boundedInteger(process.env.EKODI_GITHUB_PROVENANCE_RETRY_MS, 1000, 0, 5000);
  const candidateNumbers = candidatePullRequestNumbers();
  let lastError = '';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const number of candidateNumbers) {
      try {
        const pr = await loadPullRequestByNumber(number);
        if (isVerifiedMergedPr(pr)) return true;
      } catch (error) {
        lastError = error?.message || String(error);
      }
    }

    try {
      const pulls = await loadAssociatedPullRequests();
      if (pulls.some(isVerifiedMergedPr)) return true;
    } catch (error) {
      lastError = error?.message || String(error);
    }

    if (attempt + 1 < attempts) {
      const retryDelayMs = Math.min(retryBaseMs * 2 ** attempt, 5000);
      await sleep(retryDelayMs);
    }
  }

  if (lastError) console.warn(`[EKODI][AI-ORCHESTRATE-001] ${lastError}`);
  return false;
}

let source = 'static-policy-validation';
let intentBranch = text(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME);

if (eventName === 'pull_request' || eventName === 'pull_request_target') {
  intentBranch = text(event.pull_request?.head?.ref || process.env.GITHUB_HEAD_REF);
  if (!branchAllowed(intentBranch)) fail(`change branch must enter through EKODI AI namespace (${allowedPrefixes.join(', ')}): ${intentBranch || 'missing'}`);
  source = `pull-request:${event.pull_request?.number || 'unknown'}`;
} else if (eventName === 'push' && text(process.env.GITHUB_REF_NAME) === defaultBranch) {
  if (!await verifiedMainPrMerge()) fail(`direct push to ${defaultBranch} is forbidden; merge an EKODI AI orchestrated PR instead.`);
  source = 'protected-main-pr-merge';
} else if (eventName === 'push') {
  if (!branchAllowed(text(process.env.GITHUB_REF_NAME))) fail('non-main change pushes must use an EKODI AI branch namespace.');
  source = 'ai-branch-push-routed-through-ekodi-ai';
} else if (eventName === 'workflow_dispatch') {
  source = 'human-intent-routed-through-ekodi-ai';
} else if (eventName === 'schedule') {
  source = 'scheduled-intent-routed-through-ekodi-ai';
} else if (eventName === 'repository_dispatch' || eventName === 'workflow_run') {
  source = `${eventName}-routed-through-ekodi-ai`;
} else if (ciMode && eventName) {
  source = `${eventName}-routed-through-ekodi-ai`;
} else if (releaseMode) {
  fail('direct local production mutation is forbidden; use an EKODI AI orchestrated GitHub change/release lane.');
}

const changedFiles = currentChangedFiles();
const governanceFiles = new Set([
  'config/ai-change-orchestration-policy.json',
  'scripts/validate-ekodi-ai-change-orchestration.mjs',
  '.github/workflows/ekodi-ai-orchestration-gate.yml',
  'scripts/validate-deployment-guardrails.mjs',
]);
if (changedFiles.some(file => governanceFiles.has(file)) && eventName && !(policy.governance.policyOwners || []).includes(actor)) {
  fail(`orchestration governance may only be changed from an owner-authorized intent; actor=${actor}`);
}

function classify(files) {
  const joined = files.join('\n').toLowerCase();
  const classes = [];
  if (/migrations\/|\.sql\b|d1/.test(joined)) classes.push('data');
  if (/wrangler|\.github\/workflows|deploy\/|cloudflare/.test(joined)) classes.push('release');
  if (/secret|credential|oauth|auth/.test(joined)) classes.push('identity-integration');
  if (/domain|route|dns/.test(joined)) classes.push('topology');
  if (/admin|site|page|css|html|ui/.test(joined)) classes.push('experience');
  if (/ai-|orchestrat|provider|agent/.test(joined)) classes.push('ai-control');
  return [...new Set(classes.length ? classes : ['platform-code'])];
}

const taskClasses = classify(changedFiles);
const humanGateRecommended = taskClasses.some(value => ['topology'].includes(value));
const orchestrationId = `ekoai-${crypto.createHash('sha256').update([repository, runId, sha, source].join('|')).digest('hex').slice(0, 20)}`;
const attestation = {
  schemaVersion: 1,
  policyId: policy.policyId,
  orchestrationId,
  controlPlane: policy.controlPlane,
  orchestrator: policy.orchestrator,
  source,
  actor,
  branch: intentBranch || defaultBranch,
  sha,
  taskClasses,
  roles: policy.execution.requiredRoles,
  providerSelection: policy.execution.providerSelection,
  externalAiRole: policy.execution.externalAiRole,
  humanGateRecommended,
  directMutationAllowed: false,
  releaseMode,
  timestamp: new Date().toISOString(),
};

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts', 'ekodi-ai-orchestration-attestation.json'), `${JSON.stringify(attestation, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `orchestration_id=${orchestrationId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `source=${source}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '### EKODI AI Orchestration Gate',
    `- Policy: ${policy.policyId}`,
    `- Orchestration: \`${orchestrationId}\``,
    `- Source: ${source}`,
    `- Task classes: ${taskClasses.join(', ')}`,
    `- Provider selection: ${policy.execution.providerSelection}`,
    `- External AI role: ${policy.execution.externalAiRole}`,
    `- Direct mutation: forbidden`,
    humanGateRecommended ? '- Human Gate: recommended for topology-impacting intent' : '- Human Gate: not required by this classifier',
    '',
  ].join('\n'));
}

console.log(`[EKODI] ${policy.policyId} passed: ${orchestrationId}`);
console.log(`   source=${source} classes=${taskClasses.join(',')} provider=${policy.execution.providerSelection}`);
