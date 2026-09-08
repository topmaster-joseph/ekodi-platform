import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const policy = JSON.parse(read('config/ai-change-orchestration-policy.json'));
const validator = read('scripts/validate-ekodi-ai-change-orchestration.mjs');
const workflow = read('.github/workflows/ekodi-ai-orchestration-gate.yml');
const siteWorker = read('site-worker.js');
const workerRelease = read('scripts/guarded-worker-release.mjs');
const pagesRelease = read('scripts/guarded-pages-release.mjs');

test('EKODI AI is the mandatory change control plane', () => {
  assert.equal(policy.policyId, 'AI-ORCHESTRATE-001');
  assert.equal(policy.status, 'enforced');
  assert.equal(policy.controlPlane, 'EKODI AI');
  assert.equal(policy.mutationBoundary.breakGlassBypassEnabled, false);
  assert.equal(policy.mutationBoundary.directLocalProductionDeploy, false);
  assert.equal(policy.mutationBoundary.directManualProductionMutation, false);
  assert.equal(policy.execution.externalAiMayOwnProductionMutation, false);
  assert.equal(policy.ownerExperience.resultOnlyReporting, true);
});

test('main and production releases are fail-closed around orchestration', () => {
  assert.match(validator, /direct push to \$\{defaultBranch\} is forbidden/);
  assert.match(validator, /direct local production mutation is forbidden/);
  assert.match(workflow, /name: EKODI AI Orchestration Gate/);
  assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs --ci/);
  assert.match(workflow, /validate-workflow-orchestration-gates\.mjs/);
  assert.match(workerRelease, /runChangeOrchestrationGate\(\)/);
  assert.match(pagesRelease, /runChangeOrchestrationGate\(\)/);
});

test('direct local guarded release is refused without orchestration context', () => {
  const env = { ...process.env };
  for (const key of ['GITHUB_EVENT_NAME','GITHUB_EVENT_PATH','GITHUB_RUN_ID','GITHUB_SHA','GITHUB_REF_NAME','GITHUB_HEAD_REF','GITHUB_WORKSPACE']) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/validate-ekodi-ai-change-orchestration.mjs', '--release'], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /direct local production mutation is forbidden/);
});

test('every mutation-capable workflow job has an orchestration gate', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-workflow-orchestration-gates.mjs'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /All mutation-capable workflow jobs are behind EKODI AI Orchestration Gate/);
});

test('AI operations center dynamic module is routable in production', () => {
  assert.match(siteWorker, /'\/ai-operations-center-admin\.js'/);
});
