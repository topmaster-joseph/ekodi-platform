import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config', 'ai-change-orchestration-policy.json');
const releaseMode = process.argv.includes('--release');
const staticPolicyMode = process.argv.includes('--static-policy') || String(process.env.EKODI_ORCHESTRATION_STATIC_POLICY || '').trim() === '1';
const ciFlag = process.argv.includes('--ci');
if (staticPolicyMode && (releaseMode || ciFlag)) {
  console.error('[EKODI][AI-ORCHESTRATE-001] static policy mode cannot replace CI/release provenance enforcement.');
  process.exit(1);
}
const ciMode = ciFlag || releaseMode;

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

const constitutionalControlValidators = [
  'scripts/validate-constitution.mjs',
  'scripts/validate-platform-boundaries.mjs',
  'scripts/validate-ekodi-os-architecture.mjs',
  'scripts/validate-security-baseline.mjs',
  'scripts/validate-deployment-guardrails.mjs',
  'scripts/validate-workflow-orchestration-gates.mjs',
];
function runConstitutionalControls() {
  for (const script of constitutionalControlValidators) {
    const absolute = path.join(root, script);
    if (!fs.existsSync(absolute)) fail(`constitutional control validator is missing: ${script}`);
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) fail(`constitutional control failed: ${script}`);
  }
}

if (!fs.existsSync(policyPath)) fail('orchestration policy is missing.');
const policy = readJson(policyPath);
if (policy.policyId !== 'AI-ORCHESTRATE-001' || policy.status !== 'enforced') fail('policy must remain enforced.');
if (policy.controlPlane !== 'EKODI AI') fail('EKODI AI must remain the control plane.');
if (policy.mutationBoundary?.breakGlassBypassEnabled !== false) fail('break-glass bypass must remain disabled.');
if (policy.sourceControl?.directPushToMain !== false) fail('direct main pushes must remain forbidden.');
if (policy.execution?.externalAiMayOwnProductionMutation !== false) fail('external AI cannot own production mutation.');
const executionFallback = policy.executionFallback || {};
if (executionFallback.enabled !== true) fail('automatic execution fallback must remain enabled.');
if (executionFallback.decisionOwner !== policy.orchestrator) fail('execution fallback decision owner must remain the EKODI orchestrator.');
if (executionFallback.automaticDiscovery !== true || executionFallback.automaticPreflight !== true) fail('execution fallback must automatically discover and preflight alternate lanes.');
if (executionFallback.preserveOrchestrationGate !== true) fail('execution fallback must preserve the EKODI AI Orchestration Gate.');
if (executionFallback.preserveAuthorityAndHumanGates !== true) fail('execution fallback must preserve authority and human gates.');
if (executionFallback.ambiguousSideEffectStopsFanout !== true) fail('ambiguous side effects must stop automatic fallback fan-out.');
if (executionFallback.continueAfterExecutionErrorOnlyWhenExplicitlySafe !== true) fail('execution-error fallback must require explicit safety evidence.');
if (executionFallback.continueAfterVerifiedRollback !== true) fail('post-effect fallback must require verified rollback.');
if (executionFallback.auditEveryAttempt !== true || executionFallback.completionRequiresExecutionVerification !== true) fail('fallback attempts must remain audited and completion must require verification.');
const expectedFallbackLanes = ['github_connector','github_actions','managed_cloud_runner','service_connector','device_agent','self_hosted_runner','remote_desktop'];
if (JSON.stringify(executionFallback.preferredLaneOrder || []) !== JSON.stringify(expectedFallbackLanes)) fail('execution fallback lane order must remain cloud-first with Remote Desktop last.');

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
function githubHeaders({ authenticated = true } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'ekodi-ai-orchestration-gate',
  };
  const token = text(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
async function fetchGithubJson(endpoint, sourceLabel, { allowNotFound = false } = {}) {
  const token = text(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const request = authenticated => fetch(endpoint, {
    headers: githubHeaders({ authenticated }),
    signal: AbortSignal.timeout(10000),
  });
  let response;
  try {
    response = await request(true);
    if (response.status === 403 && token) {
      const publicResponse = await request(false);
      if (publicResponse.ok) {
        console.warn(`[EKODI][AI-ORCHESTRATE-001] ${sourceLabel} authenticated lookup returned HTTP 403; verified public PR metadata without expanding token permissions.`);
      }
      response = publicResponse;
    }
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
  const firstLine = text(event.head_commit?.message || git(['log', '-1', '--pretty=%s', sha])).split(/\r?\n/, 1)[0];
  const numbers = new Set();
  for (const pattern of [/^Merge (?:pull request|PR) #(\d+)\b/i, /\(#(\d+)\)\s*$/]) {
    const match = firstLine.match(pattern);
    if (match?.[1]) numbers.add(match[1]);
  }
  return [...numbers];
}
function isVerifiedMergedPr(pr, { shaBound = false } = {}) {
  const reportedMergeSha = text(pr?.merge_commit_sha);
  const shaVerified = shaBound
    ? (!reportedMergeSha || reportedMergeSha === sha)
    : reportedMergeSha === sha;
  return Boolean(pr)
    && text(pr?.state) === 'closed'
    && Boolean(pr?.merged_at)
    && text(pr?.base?.ref) === defaultBranch
    && shaVerified
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
      if (pulls.some(pr => isVerifiedMergedPr(pr, { shaBound: true }))) return true;
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

if (staticPolicyMode) {
  source = 'static-policy-validation';
  intentBranch = '';
} else if (eventName === 'pull_request' || eventName === 'pull_request_target') {
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
  'config/parallel-change-review-scopes.json',
  'scripts/detect-related-change-overlap.mjs',
  '.github/workflows/ai-conflict-guard.yml',
]);
if (changedFiles.some(file => governanceFiles.has(file)) && eventName && !(policy.governance.policyOwners || []).includes(actor)) {
  fail(`orchestration governance may only be changed from an owner-authorized intent; actor=${actor}`);
}

if (ciMode) runConstitutionalControls();

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
  executionFallback: Object.freeze({
    enabled: executionFallback.enabled === true,
    decisionOwner: executionFallback.decisionOwner,
    selectionPolicy: executionFallback.selectionPolicy,
    preferredLaneOrder: executionFallback.preferredLaneOrder,
    preserveOrchestrationGate: executionFallback.preserveOrchestrationGate === true,
    ambiguousSideEffectStopsFanout: executionFallback.ambiguousSideEffectStopsFanout === true,
  }),
  humanGateRecommended,
  directMutationAllowed: false,
  constitutionalControls: ciMode ? constitutionalControlValidators : [],
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
    `- Execution fallback: ${executionFallback.enabled ? 'automatic' : 'disabled'} / owner=${executionFallback.decisionOwner}`,
    `- Fallback lanes: ${(executionFallback.preferredLaneOrder || []).join(' -> ')}`,
    `- Direct mutation: forbidden`,
    ciMode ? `- Constitutional controls: ${constitutionalControlValidators.length} passed` : '- Constitutional controls: static policy mode',
    humanGateRecommended ? '- Human Gate: recommended for topology-impacting intent' : '- Human Gate: not required by this classifier',
    '',
  ].join('\n'));
}

console.log(`[EKODI] ${policy.policyId} passed: ${orchestrationId}`);
console.log(`   source=${source} classes=${taskClasses.join(',')} provider=${policy.execution.providerSelection}`);
