import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOrchestratorCompletionEvidence, isNonDeploySurface } from '../ekodi-orchestrator-task-adapter.js';

const taskId = 'orch_recovery_4598d83f8ef535cd0671dacb10da5c98';
const branchRef = `ai/claude/${taskId}`;
const mergeSha = 'bbacd89a0123456789abcdef0123456789abcdef';

function fakeGithub({ files, runs = [{ id: 1, name: 'CI' }, { id: 2, name: 'EKODI AI Orchestration Gate' }], health = { ok: true, service: 'ekodi' } }) {
  const calls = [];
  const json = data => new Response(JSON.stringify(data), { status: 200 });
  const fetchImpl = async input => {
    const url = String(input); calls.push(url);
    if (url.includes('/pulls?')) return json([{ number: 7972, html_url: 'https://github.com/x/pull/7972', merged_at: '2026-11-03T13:35:24Z', merge_commit_sha: mergeSha, head: { ref: branchRef }, base: { ref: 'main' } }]);
    if (url.includes('/actions/runs?')) return json({ workflow_runs: runs.map(r => ({ status: 'completed', conclusion: 'success', html_url: 'u', ...r })) });
    if (url.includes('/pulls/7972/files')) return json(files.map(filename => ({ filename })));
    if (url === 'https://ekodi.kr/api/health') return json(health);
    throw new Error('unexpected ' + url);
  };
  return { fetchImpl, calls };
}

test('surface classifier is conservative', () => {
  assert.equal(isNonDeploySurface(['eval/ops-baseline.mjs', 'eval/README.md', '.github/workflows/ai-eval-lab.yml']), true);
  assert.equal(isNonDeploySurface(['docs/x.md', 'test/a.test.mjs', 'scripts/validate-x.mjs', 'CLAUDE.md']), true);
  assert.equal(isNonDeploySurface(['.github/workflows/deploy-admin-site.yml']), false);
  assert.equal(isNonDeploySurface(['eval/README.md', 'sites/seonammedi/public/admin/admin-minutes.js']), false);
  assert.equal(isNonDeploySurface(['supabase/migrations/20261106090000_x.sql']), false);
  assert.equal(isNonDeploySurface([]), false);
  assert.equal(isNonDeploySurface(null), false);
});

test('merged CI/docs-only release completes without a Deploy run', async () => {
  const { fetchImpl } = fakeGithub({ files: ['eval/ops-baseline.mjs', 'eval/README.md', '.github/workflows/ai-eval-lab.yml'] });
  const r = await collectOrchestratorCompletionEvidence({ taskId, branchRef, fetchImpl });
  assert.equal(r.verified, true);
  assert.equal(r.deploymentSurface, 'none');
  assert.deepEqual([...r.deployments], []);
});

test('runtime file without Deploy run still fails closed', async () => {
  const { fetchImpl } = fakeGithub({ files: ['eval/README.md', 'admin-ai-governor.js'] });
  const r = await collectOrchestratorCompletionEvidence({ taskId, branchRef, fetchImpl });
  assert.equal(r.verified, false);
  assert.equal(r.reason, 'production_deployment_run_missing');
});

test('non-deploy release still requires required workflows and live health', async () => {
  const noCi = fakeGithub({ files: ['docs/a.md'], runs: [{ id: 2, name: 'EKODI AI Orchestration Gate' }] });
  assert.equal((await collectOrchestratorCompletionEvidence({ taskId, branchRef, fetchImpl: noCi.fetchImpl })).reason, 'required_workflow_not_successful');
  const sick = fakeGithub({ files: ['docs/a.md'], health: { ok: false } });
  assert.equal((await collectOrchestratorCompletionEvidence({ taskId, branchRef, fetchImpl: sick.fetchImpl })).verified, false);
});

test('tooling surface: CI scripts, device tools and staging configs only', () => {
  assert.equal(isNonDeploySurface(['scripts/converge-orchestrated-pr-merge.mjs', 'scripts/lib/converge-unapproved-runs.mjs']), true);
  assert.equal(isNonDeploySurface(['tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', 'tools/remote-agent-watchdog/README.md']), true);
  assert.equal(isNonDeploySurface(['wrangler.my.staging.toml', 'wrangler.energy-staging.toml']), true);
  assert.equal(isNonDeploySurface(['wrangler.my.toml']), false);
  assert.equal(isNonDeploySurface(['scripts/lib/deep/x.mjs']), false);
  assert.equal(isNonDeploySurface(['education/study/index.html']), false);
  assert.equal(isNonDeploySurface(['supabase/functions/singles-api/bank-transfer.ts']), false);
});

test('guardrail: no deployed runtime module imports from scripts/ or tools/', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, resolve, dirname } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const skip = new Set(['node_modules', '.git', 'scripts', 'tools', 'test', 'tests', 'docs', 'eval', 'evidence', '.github']);
  const offenders = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) { walk(path); continue; }
      if (!/\.(m?js|ts)$/.test(name)) continue;
      const src = readFileSync(path, 'utf8');
      for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*)['"]((?:\.\.?\/)+[^'"]+)['"]/g)) {
        const target = resolve(dirname(path), m[1]).slice(root.length).replace(/^\/+/, '');
        if (/^(?:scripts|tools)\//.test(target)) offenders.push(`${path.slice(root.length)} -> ${target}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
