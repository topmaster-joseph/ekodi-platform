import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const planPath = path.join(root, 'governance', 'legacy-branch-name-migration-20260916.json');
const artifactPath = path.join(root, 'artifacts', 'legacy-branch-name-migration-20260916.json');
const BRANCH_PATTERN = /^ai\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function validatePlan(plan) {
  if (!plan || plan.schemaVersion !== 1) throw new Error('migration schemaVersion must be 1');
  if (plan.repository !== 'topmaster-joseph/ekodi-platform') throw new Error('migration repository mismatch');
  if (plan.rule !== 'ai/<agent>/<task-id>') throw new Error('migration rule mismatch');
  if (plan.safety?.requireOpenPullRequest !== true) throw new Error('open PR precondition must remain enabled');
  if (plan.safety?.requireExactHeadSha !== true) throw new Error('exact head SHA precondition must remain enabled');
  if (plan.safety?.requireTargetBranchAbsent !== true) throw new Error('target absence precondition must remain enabled');
  if (plan.safety?.preservePullRequest !== true || plan.safety?.closePullRequests !== false) throw new Error('PR preservation invariant violated');
  if (plan.safety?.modifyTests !== false) throw new Error('test mutation must remain disabled');
  if (plan.safety?.applyIntegrationOrderApproved !== false) throw new Error('integration-order-approved must remain disabled');
  if (!Array.isArray(plan.renames) || plan.renames.length === 0) throw new Error('rename plan must not be empty');

  const prs = new Set();
  const oldNames = new Set();
  const newNames = new Set();
  for (const item of plan.renames) {
    if (!Number.isInteger(item.prNumber) || item.prNumber <= 0) throw new Error('invalid PR number');
    if (!item.oldName || !item.newName || item.oldName === item.newName) throw new Error(`invalid branch rename for PR #${item.prNumber}`);
    if (!BRANCH_PATTERN.test(item.newName)) throw new Error(`target branch violates ai/<agent>/<task-id>: ${item.newName}`);
    if (!SHA_PATTERN.test(item.expectedHeadSha || '')) throw new Error(`invalid expected head SHA for PR #${item.prNumber}`);
    if (!item.agent || !item.agentEvidence) throw new Error(`agent evidence missing for PR #${item.prNumber}`);
    if (prs.has(item.prNumber) || oldNames.has(item.oldName) || newNames.has(item.newName)) throw new Error('duplicate migration entry');
    prs.add(item.prNumber);
    oldNames.add(item.oldName);
    newNames.add(item.newName);
  }
  return true;
}

function repoApi(repository, suffix) {
  return `https://api.github.com/repos/${repository}${suffix}`;
}

async function requestJson(url, { token, method = 'GET', body, allow404 = false } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ekodi-legacy-branch-name-migration',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (allow404 && response.status === 404) return { status: 404, data: null };
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${url} failed: HTTP ${response.status} ${data?.message || text}`);
  return { status: response.status, data };
}

export async function preflight(plan, { token, request = requestJson } = {}) {
  const snapshots = [];
  for (const item of plan.renames) {
    const pr = (await request(repoApi(plan.repository, `/pulls/${item.prNumber}`), { token })).data;
    if (pr.state !== 'open' || pr.merged_at) throw new Error(`PR #${item.prNumber} is not an open unmerged PR`);
    if (pr.head?.ref !== item.oldName) throw new Error(`PR #${item.prNumber} head moved: expected ${item.oldName}, got ${pr.head?.ref}`);
    if (pr.head?.sha !== item.expectedHeadSha) throw new Error(`PR #${item.prNumber} SHA moved: expected ${item.expectedHeadSha}, got ${pr.head?.sha}`);

    const oldBranch = (await request(repoApi(plan.repository, `/branches/${encodeURIComponent(item.oldName)}`), { token })).data;
    if (oldBranch.commit?.sha !== item.expectedHeadSha) throw new Error(`source branch SHA mismatch for ${item.oldName}`);

    const target = await request(repoApi(plan.repository, `/branches/${encodeURIComponent(item.newName)}`), { token, allow404: true });
    if (target.status !== 404) throw new Error(`target branch already exists: ${item.newName}`);
    snapshots.push({ prNumber: item.prNumber, oldName: item.oldName, newName: item.newName, sha: item.expectedHeadSha });
  }
  return snapshots;
}

export async function execute(plan, { token, request = requestJson } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN is required for execution');
  validatePlan(plan);
  const preflightSnapshots = await preflight(plan, { token, request });
  const renamed = [];

  for (const item of plan.renames) {
    const result = (await request(repoApi(plan.repository, `/branches/${encodeURIComponent(item.oldName)}/rename`), {
      token,
      method: 'POST',
      body: { new_name: item.newName },
    })).data;
    if (result.name !== item.newName || result.commit?.sha !== item.expectedHeadSha) {
      throw new Error(`rename verification failed for PR #${item.prNumber}`);
    }

    const pr = (await request(repoApi(plan.repository, `/pulls/${item.prNumber}`), { token })).data;
    if (pr.state !== 'open' || pr.merged_at) throw new Error(`PR #${item.prNumber} did not remain open after rename`);
    if (pr.head?.ref !== item.newName || pr.head?.sha !== item.expectedHeadSha) throw new Error(`PR #${item.prNumber} head identity changed unexpectedly after rename`);
    renamed.push({ prNumber: item.prNumber, oldName: item.oldName, newName: item.newName, sha: item.expectedHeadSha, state: pr.state });
  }

  const report = {
    migrationId: plan.migrationId,
    repository: plan.repository,
    completedAt: new Date().toISOString(),
    preflight: preflightSnapshots,
    renamed,
  };
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  validatePlan(plan);
  if (!process.argv.includes('--execute')) {
    console.log(`[EKODI][BRANCH-MIGRATION] plan valid: ${plan.renames.length} verified renames`);
    return;
  }
  const report = await execute(plan, { token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN });
  console.log(`[EKODI][BRANCH-MIGRATION] renamed ${report.renamed.length} branches while preserving open PRs`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`[EKODI][BRANCH-MIGRATION] ${error.message}`);
    process.exit(1);
  });
}
