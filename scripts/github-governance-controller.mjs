import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'config', 'github-governance.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const args = new Set(process.argv.slice(2));
const reportOnly = args.has('--report-only');
const applyRequested = args.has('--apply');
const liveRequested = args.has('--live') || applyRequested;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function validateContract() {
  const policy = config.branchProtection || {};
  if (!/^[-\w]+\/[-.\w]+$/.test(config.repository || '')) fail('repository must be owner/name.');
  if (config.defaultBranch !== 'main') fail('defaultBranch must remain main.');
  if (policy.required !== true) fail('branch protection must be required.');
  if (policy.requirePullRequest !== true) fail('pull requests must be required.');
  if (policy.enforceAdmins !== true) fail('administrators must be covered by protection.');
  if (policy.allowForcePushes !== false) fail('force pushes must remain disabled.');
  if (policy.allowDeletions !== false) fail('branch deletion must remain disabled.');
  const checks = new Set(policy.requiredStatusChecks || []);
  for (const required of ['EKODI AI Orchestration Gate', 'test']) {
    if (!checks.has(required)) fail(`required status check missing: ${required}`);
  }
  if (process.exitCode) return false;
  console.log(`✅ GitHub governance contract ${config.version} is valid.`);
  return true;
}

function authToken(admin = false) {
  if (admin) return process.env.EKODI_GITHUB_ADMIN_TOKEN || '';
  return process.env.EKODI_GITHUB_ADMIN_TOKEN || process.env.GITHUB_TOKEN || '';
}

async function github(pathname, options = {}, admin = false) {
  const token = authToken(admin);
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'EKODI-GitHub-Governance-Controller',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${pathname}`, { ...options, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}
function desiredProtectionBody() {
  const policy = config.branchProtection;
  return {
    required_status_checks: {
      strict: policy.requireBranchesUpToDate === true,
      contexts: policy.requiredStatusChecks,
    },
    enforce_admins: policy.enforceAdmins === true,
    required_pull_request_reviews: policy.requirePullRequest ? {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: Number(policy.requiredApprovingReviewCount || 0),
    } : null,
    restrictions: null,
    required_linear_history: policy.requiredLinearHistory === true,
    allow_force_pushes: policy.allowForcePushes === true,
    allow_deletions: policy.allowDeletions === true,
    block_creations: false,
    required_conversation_resolution: false,
    lock_branch: false,
    allow_fork_syncing: true,
  };
}

function compareProtection(protection) {
  const policy = config.branchProtection;
  const drift = [];
  const contexts = new Set(protection?.required_status_checks?.contexts || []);
  for (const check of policy.requiredStatusChecks) {
    if (!contexts.has(check)) drift.push(`missing status check: ${check}`);
  }
  if (protection?.required_status_checks?.strict !== policy.requireBranchesUpToDate) drift.push('branch update requirement differs.');
  if (protection?.enforce_admins?.enabled !== policy.enforceAdmins) drift.push('admin enforcement differs.');
  if (policy.requirePullRequest && !protection?.required_pull_request_reviews) drift.push('pull request requirement is missing.');
  if (protection?.allow_force_pushes?.enabled !== policy.allowForcePushes) drift.push('force-push policy differs.');
  if (protection?.allow_deletions?.enabled !== policy.allowDeletions) drift.push('branch deletion policy differs.');
  return drift;
}

function publishResult(result) {
  const drift = result.drift?.length ? result.drift : [];
  const lines = [
    '## EKODI GitHub Governance',
    `- Repository: \`${config.repository}\``,
    `- Branch: \`${config.defaultBranch}\``,
    `- Protected: \`${result.protected}\``,
    `- Verification: \`${result.verification}\``,
    `- Drift: \`${drift.length}\``,
  ];
  if (drift.length) lines.push('', ...drift.map(item => `- ❌ ${item}`));
  else lines.push('', '- ✅ Desired GitHub governance is active.');
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `drift=${drift.length ? 'true' : 'false'}\n`);
}
async function auditLive() {
  const [owner, repo] = config.repository.split('/');
  const branchPath = `/repos/${owner}/${repo}/branches/${encodeURIComponent(config.defaultBranch)}`;
  const branch = await github(branchPath);
  if (!branch.response.ok) throw new Error(`Branch audit failed: HTTP ${branch.response.status}`);
  if (branch.payload?.protected !== true) {
    return { protected: false, verification: 'public-branch-state', drift: ['main branch protection is disabled.'] };
  }

  const adminToken = authToken(true);
  if (!adminToken) return { protected: true, verification: 'public-branch-state', drift: [] };
  const protection = await github(`${branchPath}/protection`, {}, true);
  if (!protection.response.ok) throw new Error(`Protection audit failed: HTTP ${protection.response.status}`);
  return {
    protected: true,
    verification: 'exact-admin-policy',
    drift: compareProtection(protection.payload),
  };
}

async function applyProtection() {
  const token = authToken(true);
  if (!token) throw new Error('EKODI_GITHUB_ADMIN_TOKEN is required for --apply.');
  const [owner, repo] = config.repository.split('/');
  const endpoint = `/repos/${owner}/${repo}/branches/${encodeURIComponent(config.defaultBranch)}/protection`;
  const applied = await github(endpoint, {
    method: 'PUT',
    body: JSON.stringify(desiredProtectionBody()),
    headers: { 'Content-Type': 'application/json' },
  }, true);
  if (!applied.response.ok) throw new Error(`Protection apply failed: HTTP ${applied.response.status}`);
  console.log('✅ GitHub main protection policy applied.');
}

if (!validateContract()) process.exit(1);

if (liveRequested) {
  try {
    if (applyRequested) await applyProtection();
    const result = await auditLive();
    publishResult(result);
    if (result.drift.length && !reportOnly) process.exitCode = 2;
  } catch (error) {
    console.error(`❌ ${error.message}`);
    if (!reportOnly) process.exitCode = 1;
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'drift=true\n');
  }
}
