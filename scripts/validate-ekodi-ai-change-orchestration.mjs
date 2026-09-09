import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isGithubPrMergeCommit } from './lib/ekodi-pr-merge-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config/ai-change-orchestration-policy.json');
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
function commitLooksLikePrMerge() {
  return isGithubPrMergeCommit({
    eventMessage: text(event.head_commit?.message),
    message: git(['log', '-1', '--pretty=%B', sha]),
    rawCommit: git(['cat-file', '-p', sha]),
  });
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

let source = 'static-policy-validation';
let intentBranch = text(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME);

if (eventName === 'pull_request' || eventName === 'pull_request_target') {
  intentBranch = text(event.pull_request?.head?.ref || process.env.GITHUB_HEAD_REF);
  if (!branchAllowed(intentBranch)) fail(`change branch must enter through EKODI AI namespace (${allowedPrefixes.join(', ')}): ${intentBranch || 'missing'}`);
  source = `pull-request:${event.pull_request?.number || 'unknown'}`;
} else if (eventName === 'push' && text(process.env.GITHUB_REF_NAME) === defaultBranch) {
  if (!commitLooksLikePrMerge()) fail(`direct push to ${defaultBranch} is forbidden; merge an EKODI AI orchestrated PR instead.`);
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
