import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const policy = JSON.parse(read('config/ai-change-orchestration-policy.json'));
const validator = read('scripts/validate-ekodi-ai-change-orchestration.mjs');
const releaseReceiptGate = read('scripts/orchestrator-release-receipt.mjs');
const workflow = read('.github/workflows/ekodi-ai-orchestration-gate.yml');
const siteWorker = read('site-worker.js');
const workerRelease = read('scripts/guarded-worker-release.mjs');
const pagesRelease = read('scripts/guarded-pages-release.mjs');
const sharedDeploy = read('.github/workflows/deploy-site-core.yml');
const sharedStage = read('.github/workflows/stage-shared-site-shell.yml');
const adminControl = read('.github/workflows/deploy-admin-control-plane.yml');
const ciWorkflow = read('.github/workflows/ci.yml');

test('EKODI AI is the mandatory change control plane', () => {
  assert.equal(policy.policyId, 'AI-ORCHESTRATE-001');
  assert.equal(policy.status, 'enforced');
  assert.equal(policy.controlPlane, 'EKODI AI');
  assert.equal(policy.mutationBoundary.breakGlassBypassEnabled, false);
  assert.equal(policy.mutationBoundary.directLocalProductionDeploy, false);
  assert.equal(policy.mutationBoundary.directManualProductionMutation, false);
  assert.equal(policy.execution.externalAiMayOwnProductionMutation, false);
  assert.equal(policy.ownerExperience.resultOnlyReporting, true);
  assert.equal(policy.executionFallback.enabled, true);
  assert.equal(policy.executionFallback.decisionOwner, 'ekodi-ai-orchestrator');
  assert.equal(policy.executionFallback.preserveOrchestrationGate, true);
  assert.equal(policy.executionFallback.preserveAuthorityAndHumanGates, true);
  assert.equal(policy.executionFallback.automaticDiscovery, true);
  assert.equal(policy.executionFallback.automaticPreflight, true);
  assert.equal(policy.executionFallback.ambiguousSideEffectStopsFanout, true);
  assert.equal(policy.executionFallback.continueAfterExecutionErrorOnlyWhenExplicitlySafe, true);
  assert.equal(policy.executionFallback.continueAfterVerifiedRollback, true);
  assert.equal(policy.executionFallback.preferredLaneOrder.at(-1), 'remote_desktop');
});

test('EKODI Core finalizes the plan before the default GitHub execution pipeline', () => {
  assert.deepEqual(policy.execution.defaultExecutionPath, [
    'ekodi-core-plan-finalized','github-work-branch','code-mutation','automated-tests',
    'pull-request','deployment-gate','guarded-deployment','production-verification',
  ]);
  assert.equal(policy.execution.aiConsultation, 'advisory-not-serial-prerequisite');
  assert.equal(policy.execution.consultationMayBlockCodeExecution, false);
  assert.equal(policy.execution.corePlanOwnsExecution, true);
  assert.equal(policy.execution.githubBranchMutationIsDefault, true);
  assert.equal(policy.consultationDecision.executionRelationship, 'parallel-or-advisory');
  assert.equal(policy.consultationDecision.codeExecutionMayProceedWithoutConsultationCompletion, true);
  assert.ok(policy.consultationDecision.forcedMultiConsultCategories.includes('authentication'));
  assert.ok(policy.consultationDecision.forcedMultiConsultCategories.includes('deployment'));
  assert.equal(policy.consultationDecision.failedConsultationDisposition, 'record-isolate-continue-execution-unless-human-or-safety-gate-requires-stop');
  assert.match(validator, /EKODI Core to GitHub must remain the default execution path/);
  assert.match(validator, /AI consultation may not block ordinary code execution/);
});

test('execution fallback remains orchestrator-owned and fail-closed', () => {
  assert.match(validator, /automatic execution fallback must remain enabled/);
  assert.match(validator, /execution fallback decision owner must remain the EKODI orchestrator/);
  assert.match(validator, /execution fallback must preserve the EKODI AI Orchestration Gate/);
  assert.match(validator, /ambiguous side effects must stop automatic fallback fan-out/);
  assert.match(validator, /execution-error fallback must require explicit safety evidence/);
  assert.match(validator, /post-effect fallback must require verified rollback/);
  assert.match(validator, /cloud-first with Remote Desktop last/);
  assert.match(validator, /Execution fallback:/);
  assert.match(validator, /Fallback lanes:/);
});

test('main and production releases are fail-closed around orchestration and constitution', () => {
  assert.match(validator, /direct push to \$\{defaultBranch\} is forbidden/);
  assert.match(validator, /direct local production mutation is forbidden/);
  assert.match(validator, /if \(ciMode\) runConstitutionalControls\(\)/);
  assert.match(validator, /verifyOrchestratorReleaseReceipt/);
  assert.match(releaseReceiptGate, /production-bound release branch must be orchestrator-issued/);
  assert.match(releaseReceiptGate, /orchestrator release receipt rejected/);
  for (const control of [
    'validate-constitution.mjs',
    'validate-platform-boundaries.mjs',
    'validate-ekodi-os-architecture.mjs',
    'validate-security-baseline.mjs',
    'validate-deployment-guardrails.mjs',
    'validate-workflow-orchestration-gates.mjs',
  ]) assert.match(validator, new RegExp(control.replaceAll('.', '\\.')));
  assert.match(validator, /constitutionalControls: ciMode \? constitutionalControlValidators : \[\]/);
  assert.match(workflow, /name: EKODI AI Orchestration Gate/);
  assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs --ci/);
  assert.match(workflow, /validate-workflow-orchestration-gates\.mjs/);
  assert.match(workerRelease, /runChangeOrchestrationGate\(\)/);
  assert.match(pagesRelease, /runChangeOrchestrationGate\(\)/);
});

test('static policy validation cannot replace live PR provenance enforcement', () => {
  assert.match(ciWorkflow, /EKODI_ORCHESTRATION_STATIC_POLICY:\s*'1'[\s\S]*?npm run check/);
  assert.match(validator, /static policy mode cannot replace CI\/release provenance enforcement/);
  assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs --ci/);

  const cwd = new URL('..', import.meta.url);
  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF_NAME: 'main',
    GITHUB_REPOSITORY: 'topmaster-joseph/ekodi-platform',
    GITHUB_RUN_ID: 'static-policy-test',
    GITHUB_SHA: '0000000000000000000000000000000000000001',
    GITHUB_ACTOR: 'topmaster-joseph',
  };
  const staticCheck = spawnSync(process.execPath, ['scripts/validate-ekodi-ai-change-orchestration.mjs'], { cwd, env: { ...env, EKODI_ORCHESTRATION_STATIC_POLICY: '1' }, encoding: 'utf8' });
  assert.equal(staticCheck.status, 0, staticCheck.stdout + '\n' + staticCheck.stderr);
  assert.match(staticCheck.stdout, /source=static-policy-validation/);

  const forbidden = spawnSync(process.execPath, ['scripts/validate-ekodi-ai-change-orchestration.mjs', '--static-policy', '--release'], { cwd, env, encoding: 'utf8' });
  assert.notEqual(forbidden.status, 0);
  assert.match(forbidden.stderr, /static policy mode cannot replace CI\/release provenance enforcement/);
});

test('production workflows that validate PR provenance can read pull requests', () => {
  for (const [name, source] of [['shared deploy', sharedDeploy], ['shared staging', sharedStage], ['admin control', adminControl], ['main CI', ciWorkflow]]) {
    const permissions = source.match(/permissions:\s*\n((?:\s+[a-z-]+:\s*(?:read|none)\s*\n)+)/)?.[1] || '';
    assert.match(permissions, /^\s*contents:\s*read\s*$/m, `${name} must keep repository contents read-only`);
    assert.match(permissions, /^\s*pull-requests:\s*read\s*$/m, `${name} must grant read-only PR provenance access`);
    assert.doesNotMatch(permissions, /:\s*write\s*$/m, `${name} must not gain write permission while reading PR provenance`);
  }
});
test('shared-site production provenance gate receives the scoped GitHub token', () => {
  assert.match(sharedDeploy, /name: EKODI AI Orchestration Gate[\s\S]*?GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}[\s\S]*?validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(sharedDeploy, /name: Candidate at 0%, verify routes, promote and auto-rollback on failure[\s\S]*?GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}[\s\S]*?guarded-worker-release\.mjs --manifest deploy\/manifests\/shared-site\.worker\.json/);
  assert.match(sharedDeploy, /paths:[\s\S]*?- '\.github\/workflows\/deploy-site-core\.yml'/, 'shared-site workflow changes must retrigger the guarded release');
});
test('main accepts verified PR provenance and still rejects a direct push', () => {
  const cwd = new URL('..', import.meta.url); const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-orchestration-')); const eventPath = path.join(dir, 'event.json'); const provenancePath = path.join(dir, 'pulls.json');
  const taskId='orch_00000000-0000-4000-8000-000000000001'; const branchRef=`ai/chatgpt/${taskId}`;
  const baseEnv = { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventPath, GITHUB_REF_NAME: 'main', GITHUB_REPOSITORY: 'fixture/ekodi-platform', GITHUB_RUN_ID: 'test-main-merge', GITHUB_ACTOR: 'topmaster-joseph', EKODI_GITHUB_PR_PROVENANCE: provenancePath };
  try {
    fs.writeFileSync(eventPath, JSON.stringify({ head_commit: { message: 'squashed PR title (#1302)' } }));
    fs.writeFileSync(provenancePath, JSON.stringify([{ number:1302,state:'closed',merged_at:'2026-09-09T00:00:00Z',merge_commit_sha:head,base:{ref:'main'},head:{ref:branchRef} }]));
    const merged=spawnSync(process.execPath,['scripts/validate-ekodi-ai-change-orchestration.mjs','--release'],{cwd,env:{...baseEnv,GITHUB_SHA:head},encoding:'utf8'}); assert.equal(merged.status,0,merged.stdout+'\n'+merged.stderr); assert.match(merged.stdout,/source=protected-main-pr-merge/);
    fs.writeFileSync(eventPath, JSON.stringify({ head_commit: { message: 'feat: direct push sentinel' } })); fs.writeFileSync(provenancePath,'[]');
    const direct=spawnSync(process.execPath,['scripts/validate-ekodi-ai-change-orchestration.mjs','--release'],{cwd,env:{...baseEnv,GITHUB_SHA:'0000000000000000000000000000000000000001'},encoding:'utf8'}); assert.notEqual(direct.status,0); assert.match(direct.stdout+'\n'+direct.stderr,/direct push to main is forbidden/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
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
