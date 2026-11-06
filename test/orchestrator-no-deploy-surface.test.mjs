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
