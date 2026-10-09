/**
 * Read-only, fail-closed independent verification of six mandatory workflows.
 * Source-only until a receipt-approved Orchestrator branch owns this change.
 * This script NEVER dispatches, retries release jobs, mutates git, or deploys.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const REQUIRED_WORKFLOWS = Object.freeze([
  { name: 'EKODI Constitution Check', file: 'constitution-check.yml', jobs: ['constitution'] },
  { name: 'CI', file: 'ci.yml', jobs: ['CI Orchestration Contract', 'test'] },
  { name: 'Device Control Windows CI', file: 'device-control-windows.yml', jobs: ['contract', 'windows-agent'] },
  { name: 'Device Agent Production Verification', file: 'device-agent-production-verification.yml', jobs: ['contract', 'real-device'] },
  { name: 'Deploy Control API', file: 'deploy-control-api.yml', jobs: ['validate', 'staging', 'production'] },
  { name: 'Deploy EKODI Shared Site Core', file: 'deploy-site-core.yml', jobs: [
    'staging_gate', 'reliability_gate', 'deploy',
    'EKODI Authenticated Admin Surface Verification',
    'EKODI Native Surface Verification · Desktop',
    'EKODI Native Surface Verification · Mobile',
  ] },
]);

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const EXPECTED_EVENTS = new Set(['push', 'workflow_dispatch', 'schedule']);
const DEFAULT_REPOSITORY = 'topmaster-joseph/ekodi-platform';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function githubRequestJson(path, { repository = DEFAULT_REPOSITORY, fetchImpl = fetch } = {}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  };
  const url = 'https://api.github.com/repos/' + repository + path;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15000) });
    if (response.ok) return response.json();
    if (![500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error('GitHub read failed HTTP ' + response.status + ' at ' + path.split('?')[0]);
    }
    await wait(500 * (2 ** attempt)); // Bounded transient retry; 403/429 fail closed.
  }
  throw new Error('GitHub read failed');
}

function requiredJobEvidence(jobs, required) {
  if (!Array.isArray(jobs) || jobs.length === 0) return { ok: false, reason: 'no-jobs' };
  for (const name of required) {
    // Matrix jobs are exposed as "job_id / matrix_value" by GitHub Actions.
    // Every instance must succeed: one passing subjob cannot mask a skipped peer.
    const matches = jobs.filter(x => x.name === name || x.name?.startsWith(name + ' / '));
    if (!matches.length) return { ok: false, reason: 'required-job-missing:' + name };
    const blocked = matches.find(job => job.status !== 'completed' || job.conclusion !== 'success');
    if (blocked) {
      return {
        ok: false,
        reason: 'required-job-not-success:' + blocked.name + ':' +
          (blocked.conclusion || blocked.status || 'unknown'),
      };
    }
  }
  // The strict user contract rejects skipped jobs, even if a workflow reports success.
  const otherBlocked = jobs.find(job => job.status !== 'completed' || job.conclusion !== 'success');
  if (otherBlocked) {
    return {
      ok: false,
      reason: 'workflow-job-not-success:' + otherBlocked.name + ':' +
        (otherBlocked.conclusion || otherBlocked.status || 'unknown'),
    };
  }
  return { ok: true };
}

export async function auditLatestMain({
  requestJson = githubRequestJson,
  workflows = REQUIRED_WORKFLOWS,
} = {}) {
  const getMain = async () => {
    const data = await requestJson('/git/ref/heads/main');
    const sha = data?.object?.sha;
    if (!SHA_PATTERN.test(sha || '')) throw new Error('GitHub main SHA unavailable');
    return sha;
  };
  const sha = await getMain();
  const checks = [];
  for (const wf of workflows) {
    const url = '/actions/workflows/' + encodeURIComponent(wf.file) +
      '/runs?branch=main&head_sha=' + sha + '&per_page=100';
    const data = await requestJson(url);
    if (!Array.isArray(data?.workflow_runs)) throw new Error('GitHub workflow run listing invalid: ' + wf.name);
    const candidates = data.workflow_runs.filter(run =>
      run.path === '.github/workflows/' + wf.file &&
      run.name === wf.name &&
      run.head_sha === sha &&
      run.head_branch === 'main' &&
      EXPECTED_EVENTS.has(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success'
    ).slice(0, 8);
    let evidence = { name: wf.name, ok: false, reason: 'no-successful-latest-main-run', url: null };
    for (const run of candidates) {
      if (!Number.isSafeInteger(run.id) || run.id < 1) continue;
      const detail = await requestJson('/actions/runs/' + run.id + '/jobs?per_page=100');
      if (!Array.isArray(detail?.jobs) || detail.total_count > 100) {
        throw new Error('Incomplete job evidence: ' + wf.name + ' run ' + run.id);
      }
      const proof = requiredJobEvidence(detail.jobs, wf.jobs);
      evidence = {
        name: wf.name, ok: proof.ok, reason: proof.ok ? 'verified' : proof.reason,
        run_id: run.id, url: run.html_url || null, head_sha: run.head_sha,
      };
      if (evidence.ok) break;
    }
    checks.push(evidence);
  }
  const latestSha = await getMain();
  const stableMain = sha === latestSha;
  return {
    ok: stableMain && checks.length === workflows.length && checks.every(x => x.ok),
    sha, latestSha, stableMain,
    checks, passed: checks.filter(x => x.ok).length, required: workflows.length,
    ...(stableMain ? {} : { reason: 'main-sha-changed-during-audit' }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Strictly a diagnostic CLI. Successful output is not an operating release receipt.
  try {
    const result = await auditLatestMain();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write('[EKODI six-workflow audit] ' + error.message + '\n');
    process.exitCode = 1;
  }
}
